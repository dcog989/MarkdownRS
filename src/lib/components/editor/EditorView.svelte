<script lang="ts">
    import { toggleInsertMode } from "$lib/stores/editorMetrics.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { filePathPlugin, filePathTheme } from "$lib/utils/filePathExtension";
    import { blockquotePlugin, bulletPointPlugin, codeBlockPlugin, highlightPlugin, horizontalRulePlugin, inlineCodePlugin, urlPlugin } from "$lib/utils/markdownExtensions";
    import { createRecentChangesHighlighter } from "$lib/utils/recentChangesExtension";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { searchState, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { prefetchSuggestions, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { userThemeExtension } from "$lib/utils/themeMapper";
    import { throttle } from "$lib/utils/timing";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord, completionKeymap } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyField, historyKeymap, indentWithTab } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { indentUnit } from "@codemirror/language";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
    import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightWhitespace, keymap, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
    import { onDestroy, onMount } from "svelte";

    let {
        tabId,
        initialContent = "",
        filename = "",
        isMarkdown = true,
        initialScrollPercentage = 0,
        initialSelection = { anchor: 0, head: 0 },
        initialHistoryState,
        lineChangeTracker,
        onContentChange,
        onMetricsChange,
        onScrollChange,
        onSelectionChange,
        customKeymap = [],
        spellCheckLinter,
        eventHandlers,
        cmView = $bindable(),
    } = $props<{
        tabId: string;
        initialContent?: string;
        filename?: string;
        isMarkdown?: boolean;
        initialScrollPercentage?: number;
        initialSelection?: { anchor: number; head: number };
        initialHistoryState?: any;
        lineChangeTracker: any;
        onContentChange: (content: string) => void;
        onMetricsChange: (metrics: any) => void;
        onScrollChange?: (percentage: number, topLine: number) => void;
        onSelectionChange?: (anchor: number, head: number) => void;
        customKeymap?: any[];
        spellCheckLinter: any;
        eventHandlers: any;
        cmView?: EditorView & { getHistoryState?: () => any };
    }>();

    let editorContainer: HTMLDivElement;
    let view = $state<EditorView & { getHistoryState?: () => any }>();

    let wrapComp = new Compartment();
    let autoComp = new Compartment();
    let recentComp = new Compartment();
    let historyComp = new Compartment();
    let themeComp = new Compartment();
    let indentComp = new Compartment();
    let spellComp = new Compartment();
    let whitespaceComp = new Compartment();
    let languageComp = new Compartment();
    let handlersComp = new Compartment();
    let doubleClickComp = new Compartment();
    let rulerComp = new Compartment();

    let contentUpdateTimer: number | null = null,
        metricsUpdateTimer: number | null = null;

    class NewlineWidget extends WidgetType {
        toDOM() {
            const span = document.createElement("span");
            span.className = "cm-newline";
            span.textContent = "¬";
            return span;
        }
    }

    function getNewlineDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of view.visibleRanges) {
            for (let pos = from; pos <= to; ) {
                const line = view.state.doc.lineAt(pos);
                if (line.to < view.state.doc.length) {
                    builder.add(line.to, line.to, Decoration.widget({ widget: new NewlineWidget(), side: 1 }));
                }
                pos = line.to + 1;
            }
        }
        return builder.finish();
    }

    const newlinePlugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            constructor(view: EditorView) {
                this.decorations = getNewlineDecorations(view);
            }
            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = getNewlineDecorations(update.view);
                }
            }
        },
        { decorations: (v) => v.decorations }
    );

    const rulerPlugin = ViewPlugin.fromClass(
        class {
            ruler: HTMLElement;
            constructor(view: EditorView) {
                this.ruler = document.createElement("div");
                this.ruler.className = "cm-ruler-line";
                this.ruler.style.position = "absolute";
                this.ruler.style.top = "0";
                this.ruler.style.bottom = "0";
                this.ruler.style.width = "1px";
                this.ruler.style.backgroundColor = "var(--color-border-light)";
                this.ruler.style.opacity = "0.3";
                this.ruler.style.pointerEvents = "none";
                this.ruler.style.display = "none";
                this.ruler.style.zIndex = "0";
                view.scrollDOM.appendChild(this.ruler);
                this.measure(view);
            }
            update(update: ViewUpdate) {
                if (update.geometryChanged || update.viewportChanged) {
                    this.measure(update.view);
                }
            }
            measure(view: EditorView) {
                const column = appContext.app.wrapGuideColumn;
                if (column > 0) {
                    const charWidth = view.defaultCharacterWidth;
                    const gutters = view.dom.querySelector(".cm-gutters") as HTMLElement;
                    const gutterWidth = gutters ? gutters.offsetWidth : 0;
                    const style = window.getComputedStyle(view.contentDOM);
                    const paddingLeft = parseFloat(style.paddingLeft) || 0;
                    const left = gutterWidth + paddingLeft + column * charWidth;
                    this.ruler.style.left = `${left}px`;
                    this.ruler.style.display = "block";
                } else {
                    this.ruler.style.display = "none";
                }
            }
            destroy() {
                this.ruler.remove();
            }
        }
    );

    let autocompletionConfig = $derived.by(() => {
        if (!appContext.app.enableAutocomplete) return [];
        const delay = appContext.app.autocompleteDelay;
        let timeoutId: number | null = null;
        return autocompletion({
            activateOnTyping: true,
            closeOnBlur: true,
            defaultKeymap: true,
            aboveCursor: false,
            maxRenderedOptions: 100,
            override:
                delay > 0
                    ? [
                          async (context) => {
                              if (timeoutId !== null) clearTimeout(timeoutId);
                              await new Promise((resolve) => {
                                  timeoutId = window.setTimeout(resolve, delay);
                              });
                              return completeAnyWord(context);
                          },
                      ]
                    : undefined,
        });
    });

    function createWrapExtension() {
        const wrapEnabled = appContext.app.editorWordWrap;
        const column = appContext.app.wrapGuideColumn;
        const extensions = [];
        if (wrapEnabled) {
            extensions.push(EditorView.lineWrapping);
            if (column > 0) {
                extensions.push(
                    EditorView.theme({
                        ".cm-content": { maxWidth: `${column}ch` },
                        ".cm-scroller": { width: "100%" },
                    })
                );
            }
        }
        return extensions;
    }

    $effect(() => {
        cmView = view;
    });

    const internalMouseHandler = EditorView.domEventHandlers({
        mousemove: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return;
            const range = view.state.wordAt(pos);
            if (range) {
                const word = view.state.sliceDoc(range.from, range.to);
                prefetchSuggestions(word);
            }
            return false;
        },
    });

    function createDoubleClickHandler() {
        if (!appContext.app.doubleClickSelectsTrailingSpace) return [];
        return EditorView.domEventHandlers({
            dblclick: (event, view) => {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos === null) return false;
                const range = view.state.wordAt(pos);
                if (!range) return false;
                let end = range.to;
                if (end < view.state.doc.length) {
                    const nextChar = view.state.doc.sliceString(end, end + 1);
                    if (nextChar === " " || nextChar === "\t") end++;
                }
                if (end > range.to) {
                    view.dispatch({ selection: { anchor: range.from, head: end } });
                    event.preventDefault();
                    return true;
                }
                return false;
            },
        });
    }

    let dynamicTheme = $derived.by(() => {
        const fontSize = appContext.app.editorFontSize || 14;
        const isDark = appContext.app.theme === "dark";
        const whitespaceColor = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";
        return EditorView.theme({
            "&": { height: "100%", fontSize: `${fontSize}px` },
            ".cm-cursor": { borderLeftColor: appContext.metrics.insertMode === "OVR" ? "transparent" : "var(--color-fg-default)", borderBottom: appContext.metrics.insertMode === "OVR" ? "2px solid var(--color-accent-secondary)" : "none" },
            ".cm-scroller": { fontFamily: appContext.app.editorFontFamily, overflow: "auto", overflowAnchor: "none" },
            ".cm-scroller::-webkit-scrollbar": { display: "none" },
            ".cm-content": { paddingBottom: "40px !important" },
            ".cm-gutters": { border: "none", backgroundColor: "transparent" },
            ".cm-gutterElement": { alignItems: "flex-start !important" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--color-selection-bg) !important" },
            ".cm-selectionMatch": { backgroundColor: "var(--color-selection-match-bg)" },
            ".cm-searchMatch": { backgroundColor: isDark ? "rgba(255, 255, 0, 0.2)" : "rgba(255, 215, 0, 0.4)", outline: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.1)", borderRadius: "2px" },
            ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: isDark ? "#d19a66 !important" : "#ff9900 !important", color: isDark ? "#000 !important" : "#fff !important", borderRadius: "2px" },
            ".cm-tooltip": { backgroundColor: "var(--color-bg-panel)", border: "1px solid var(--color-border-light)", color: "var(--color-fg-default)", borderRadius: "6px" },
            ".cm-tooltip.cm-tooltip-autocomplete": { borderRadius: "6px", overflow: "hidden", border: "1px solid var(--color-border-light)", backgroundColor: "var(--color-bg-panel)", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "4px 8px" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--color-accent-primary) !important", color: "var(--color-fg-inverse) !important" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": { color: "var(--color-fg-inverse) !important" },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": { color: "rgba(255, 255, 255, 0.7) !important" },
            ".cm-completionIcon": { marginRight: "0.5em", opacity: "0.7" },
            ".cm-completionDetail": { marginLeft: "0.5em", fontStyle: "italic", opacity: "0.5" },
            ".cm-tooltip.cm-tooltip-lint": { backgroundColor: "var(--color-bg-panel)", border: "1px solid var(--color-border-light)", color: "var(--color-fg-default)" },
            ".cm-highlightSpace": { backgroundImage: "none !important", position: "relative", "&:before": { content: "'·'", color: whitespaceColor, position: "absolute", top: "0", left: "0", pointerEvents: "none", fontWeight: "bold", transform: "scale(1.2)" } },
            ".cm-highlightTab": { backgroundImage: "none !important", position: "relative", "&:before": { content: "'→'", color: whitespaceColor, position: "absolute", top: "0", left: "0", pointerEvents: "none", fontWeight: "bold", transform: "scale(1.2)" } },
            ".cm-newline": { color: whitespaceColor, userSelect: "none", pointerEvents: "none", display: "inline-block", verticalAlign: "middle", marginLeft: "2px", fontWeight: "bold", transform: "scale(1.2)" },
        });
    });

    const markdownExtensions = [markdown({ base: markdownLanguage, codeLanguages: languages }), highlightPlugin, blockquotePlugin, codeBlockPlugin, inlineCodePlugin, horizontalRulePlugin, bulletPointPlugin, urlPlugin];

    $effect(() => {
        const _ = spellcheckState.customDictionary;
        if (view && spellcheckState.dictionaryLoaded) {
            view.dispatch({ effects: spellComp.reconfigure(createSpellCheckLinter()) });
        }
    });

    $effect(() => {
        if (view) {
            const _col = appContext.app.wrapGuideColumn;
            view.dispatch({
                effects: [wrapComp.reconfigure(createWrapExtension()), autoComp.reconfigure(autocompletionConfig), recentComp.reconfigure(createRecentChangesHighlighter(lineChangeTracker)), historyComp.reconfigure(history({ minDepth: appContext.app.undoDepth })), themeComp.reconfigure(dynamicTheme), indentComp.reconfigure(indentUnit.of(" ".repeat(Math.max(1, appContext.app.defaultIndent)))), whitespaceComp.reconfigure(appContext.app.showWhitespace ? [highlightWhitespace(), newlinePlugin] : []), languageComp.reconfigure(isMarkdown ? markdownExtensions : []), handlersComp.reconfigure(eventHandlers), doubleClickComp.reconfigure(createDoubleClickHandler()), rulerComp.reconfigure(rulerPlugin)],
            });
        }
    });

    onMount(() => {
        const extensions = [
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            historyComp.of(history({ minDepth: appContext.app.undoDepth })),
            search({ top: true }),
            highlightSelectionMatches(),
            autoComp.of([]),
            recentComp.of([]),
            closeBrackets(),
            EditorView.inputHandler.of((view, from, to, text) => {
                if (text === "`" && from === to) {
                    const state = view.state;
                    const before = state.sliceDoc(Math.max(0, from - 2), from);
                    const after = state.sliceDoc(from, from + 1);
                    if (after === "`" && state.sliceDoc(Math.max(0, from - 1), from) === "`") {
                        view.dispatch({ selection: { anchor: from + 1 } });
                        return true;
                    }
                    if (before === "``") {
                        const line = state.doc.lineAt(from);
                        const textBefore = line.text.slice(0, from - line.from - 2);
                        if (/^\s*$/.test(textBefore)) {
                            const indent = textBefore;
                            view.dispatch({ changes: { from, to, insert: "`\n" + indent + "\n" + indent + "```" }, selection: { anchor: from + 1 + indent.length + 1 } });
                            return true;
                        }
                    }
                    view.dispatch({ changes: { from, to, insert: "``" }, selection: { anchor: from + 1 } });
                    return true;
                }
                return false;
            }),
            EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
            filePathPlugin,
            filePathTheme,
            keymap.of([
                indentWithTab,
                {
                    key: "Insert",
                    run: () => {
                        toggleInsertMode();
                        return true;
                    },
                },
                {
                    key: "Mod-Home",
                    run: (v) => {
                        v.dispatch({ selection: { anchor: 0 } });
                        scrollSync.handleFastScroll(v, 0);
                        return true;
                    },
                },
                {
                    key: "Mod-End",
                    run: (v) => {
                        v.dispatch({ selection: { anchor: v.state.doc.length } });
                        scrollSync.handleFastScroll(v, v.scrollDOM.scrollHeight);
                        return true;
                    },
                },
                {
                    key: "PageDown",
                    run: (v) => {
                        scrollSync.handleFastScroll(v, v.scrollDOM.scrollTop + v.scrollDOM.clientHeight);
                        return true;
                    },
                },
                {
                    key: "PageUp",
                    run: (v) => {
                        scrollSync.handleFastScroll(v, v.scrollDOM.scrollTop - v.scrollDOM.clientHeight);
                        return true;
                    },
                },
                ...customKeymap,
                ...completionKeymap,
                ...closeBracketsKeymap,
                ...historyKeymap,
                ...defaultKeymap,
            ]),
            themeComp.of(dynamicTheme),
            indentComp.of(indentUnit.of("  ")),
            whitespaceComp.of([]),
            languageComp.of(isMarkdown ? markdownExtensions : []),
            userThemeExtension,
            spellComp.of(createSpellCheckLinter()),
            doubleClickComp.of(createDoubleClickHandler()),
            rulerComp.of(rulerPlugin),
            wrapComp.of(createWrapExtension()),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            EditorView.scrollMargins.of(() => ({ bottom: 30 })),
            internalMouseHandler,
            handlersComp.of(eventHandlers),
        ];

        // Hydrate history if available
        if (initialHistoryState) {
            extensions.push(historyField.init(() => initialHistoryState));
        }

        extensions.push(
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
                    contentUpdateTimer = window.setTimeout(() => onContentChange(update.state.doc.toString()), CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);
                }
                if (update.selectionSet) {
                    if (onSelectionChange) {
                        const sel = update.state.selection.main;
                        onSelectionChange(sel.anchor, sel.head);
                        if (sel.empty) {
                            const range = update.state.wordAt(sel.head);
                            if (range) {
                                const word = update.state.sliceDoc(range.from, range.to);
                                prefetchSuggestions(word);
                            }
                        }
                    }
                }
                if (update.docChanged || update.selectionSet) {
                    if (metricsUpdateTimer) clearTimeout(metricsUpdateTimer);
                    metricsUpdateTimer = window.setTimeout(() => {
                        const state = update.view.state;
                        const line = state.doc.lineAt(state.selection.main.head);
                        onMetricsChange(calculateCursorMetrics(state.doc.toString(), state.selection.main.head, { number: line.number, from: line.from, text: line.text }));
                    }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
                }
            })
        );

        const safeSelection = {
            anchor: Math.min(initialSelection.anchor, initialContent.length),
            head: Math.min(initialSelection.head, initialContent.length),
        };

        const viewInstance = new EditorView({
            state: EditorState.create({
                doc: initialContent,
                extensions,
                selection: safeSelection,
            }),
            parent: editorContainer,
        });

        (viewInstance as any).getHistoryState = () => {
            return viewInstance.state.field(historyField, false);
        };

        view = viewInstance;

        if (initialScrollPercentage > 0) {
            setTimeout(() => {
                if (!view) return;
                const dom = view.scrollDOM;
                const max = dom.scrollHeight - dom.clientHeight;
                if (max > 0) {
                    dom.scrollTop = initialScrollPercentage * max;
                }
            }, 0);
        }

        const handleModifierKey = (e: KeyboardEvent) => {
            if (e.key === "Control" || e.key === "Meta") {
                if (e.type === "keydown") {
                    view?.dom.classList.add("cm-modifier-down");
                } else {
                    view?.dom.classList.remove("cm-modifier-down");
                }
            }
        };
        const clearModifier = () => view?.dom.classList.remove("cm-modifier-down");

        window.addEventListener("keydown", handleModifierKey);
        window.addEventListener("keyup", handleModifierKey);
        window.addEventListener("blur", clearModifier);

        const handleScroll = throttle(() => {
            if (!view || !onScrollChange) return;
            const dom = view.scrollDOM;
            const max = dom.scrollHeight - dom.clientHeight;
            const percentage = max > 0 ? dom.scrollTop / max : 0;
            const lineBlock = view.lineBlockAtHeight(dom.scrollTop);
            const docLine = view.state.doc.lineAt(lineBlock.from);
            onScrollChange(percentage, docLine.number);
        }, 100);

        view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });
        scrollSync.registerEditor(view);

        if (searchState.findText) {
            updateSearchEditor(view);
        }

        view.focus();

        return () => {
            if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
            if (metricsUpdateTimer) clearTimeout(metricsUpdateTimer);
            window.removeEventListener("keydown", handleModifierKey);
            window.removeEventListener("keyup", handleModifierKey);
            window.removeEventListener("blur", clearModifier);
            view?.scrollDOM.removeEventListener("scroll", handleScroll);
            if (view) view.destroy();
        };
    });

    onDestroy(() => {
        if (view) view.destroy();
    });
</script>

<div role="none" class="w-full h-full overflow-hidden bg-bg-main relative" bind:this={editorContainer} onclick={() => view?.focus()}></div>
