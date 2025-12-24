<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorMetrics } from "$lib/stores/editorMetrics.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { filePathPlugin, filePathTheme } from "$lib/utils/filePathExtension";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { blockquotePlugin, codeBlockPlugin, highlightPlugin } from "$lib/utils/markdownExtensions";
    import { createRecentChangesHighlighter } from "$lib/utils/recentChangesExtension";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { userThemeExtension } from "$lib/utils/themeMapper";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord, completionKeymap } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
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
        onContentChange,
        onMetricsChange,
        customKeymap = [],
        spellCheckLinter,
        eventHandlers,
        cmView = $bindable(),
    } = $props<{
        tabId: string;
        initialContent?: string;
        filename?: string;
        onContentChange: (content: string) => void;
        onMetricsChange: (metrics: any) => void;
        customKeymap?: any[];
        spellCheckLinter: any;
        eventHandlers: any;
        cmView?: EditorView;
    }>();

    let editorContainer: HTMLDivElement;
    let view = $state<EditorView>();

    // Compartments
    let wrapComp = new Compartment();
    let autoComp = new Compartment();
    let recentComp = new Compartment();
    let historyComp = new Compartment();
    let themeComp = new Compartment();
    let indentComp = new Compartment();
    let spellComp = new Compartment();
    let whitespaceComp = new Compartment();

    let contentUpdateTimer: number | null = null,
        metricsUpdateTimer: number | null = null;
    const lineChangeTracker = new LineChangeTracker();

    // -- Visual Extensions --
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
                // Only show newline widget if it's not the very last line of doc (which has no newline)
                if (line.to < view.state.doc.length) {
                    builder.add(
                        line.to,
                        line.to,
                        Decoration.widget({
                            widget: new NewlineWidget(),
                            side: 1,
                        })
                    );
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
        {
            decorations: (v) => v.decorations,
        }
    );
    // -----------------------

    $effect(() => {
        cmView = view;
    });

    let dynamicTheme = $derived.by(() => {
        const fontSize = appState.editorFontSize || 14;
        const isDark = appState.theme === "dark";
        const whitespaceColor = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";

        return EditorView.theme({
            "&": { height: "100%", fontSize: `${fontSize}px` },
            ".cm-cursor": { borderLeftColor: editorMetrics.insertMode === "OVR" ? "transparent" : "var(--color-fg-default)", borderBottom: editorMetrics.insertMode === "OVR" ? "2px solid var(--color-accent-secondary)" : "none" },
            ".cm-scroller": {
                fontFamily: appState.editorFontFamily,
                overflow: "auto",
                overflowAnchor: "none",
            },
            ".cm-scroller::-webkit-scrollbar": {
                display: "none",
            },
            ".cm-content": { paddingBottom: "40px !important" },
            ".cm-gutters": { border: "none", backgroundColor: "transparent" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
                backgroundColor: "var(--color-selection-bg) !important",
            },
            ".cm-selectionMatch": {
                backgroundColor: "var(--color-selection-match-bg)",
            },
            ".cm-searchMatch": {
                backgroundColor: isDark ? "rgba(255, 255, 0, 0.2)" : "rgba(255, 215, 0, 0.4)",
                outline: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: "2px",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
                backgroundColor: isDark ? "#d19a66 !important" : "#ff9900 !important",
                color: isDark ? "#000 !important" : "#fff !important",
                borderRadius: "2px",
            },

            // Tooltip & Autocomplete Styles
            ".cm-tooltip": {
                backgroundColor: "var(--color-bg-panel)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-fg-default)",
                borderRadius: "6px",
            },
            ".cm-tooltip.cm-tooltip-autocomplete": {
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid var(--color-border-light)",
                backgroundColor: "var(--color-bg-panel)",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
                padding: "4px 8px",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
                backgroundColor: "var(--color-accent-primary) !important",
                color: "var(--color-fg-inverse) !important",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": {
                color: "var(--color-fg-inverse) !important",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
                color: "rgba(255, 255, 255, 0.7) !important",
            },
            ".cm-completionIcon": {
                marginRight: "0.5em",
                opacity: "0.7",
            },
            ".cm-completionDetail": {
                marginLeft: "0.5em",
                fontStyle: "italic",
                opacity: "0.5",
            },
            ".cm-tooltip.cm-tooltip-lint": {
                backgroundColor: "var(--color-bg-panel)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-fg-default)",
            },

            // Explicit Whitespace Styling
            ".cm-highlightSpace": {
                backgroundImage: "none !important",
                position: "relative",
                "&:before": {
                    content: "'·'",
                    color: whitespaceColor,
                    position: "absolute",
                    top: "0",
                    left: "0",
                    pointerEvents: "none",
                    fontWeight: "bold",
                    transform: "scale(1.2)",
                },
            },
            ".cm-highlightTab": {
                backgroundImage: "none !important",
                position: "relative",
                "&:before": {
                    content: "'→'",
                    color: whitespaceColor,
                    position: "absolute",
                    top: "0",
                    left: "0",
                    pointerEvents: "none",
                    fontWeight: "bold",
                    transform: "scale(1.2)",
                },
            },
            ".cm-newline": {
                color: whitespaceColor,
                userSelect: "none",
                pointerEvents: "none",
                display: "inline-block",
                verticalAlign: "middle",
                marginLeft: "2px",
                fontWeight: "bold",
                transform: "scale(1.2)",
            },
        });
    });

    $effect(() => {
        if (view && spellcheckState.dictionaryLoaded) {
            view.dispatch({
                effects: spellComp.reconfigure(createSpellCheckLinter()),
            });
        }
    });

    $effect(() => {
        if (view)
            view.dispatch({
                effects: [wrapComp.reconfigure(appState.editorWordWrap ? EditorView.lineWrapping : []), autoComp.reconfigure(appState.enableAutocomplete ? autocompletion() : []), recentComp.reconfigure(createRecentChangesHighlighter(lineChangeTracker)), historyComp.reconfigure(history({ minDepth: appState.undoDepth })), themeComp.reconfigure(dynamicTheme), indentComp.reconfigure(indentUnit.of(" ".repeat(Math.max(1, appState.defaultIndent)))), whitespaceComp.reconfigure(appState.showWhitespace ? [highlightWhitespace(), newlinePlugin] : [])],
            });
    });

    onMount(() => {
        const extensions = [
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            historyComp.of(history({ minDepth: appState.undoDepth })),
            search({ top: true }),
            highlightSelectionMatches(),
            autoComp.of([]),
            recentComp.of([]),
            closeBrackets(),
            EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
            filePathPlugin,
            filePathTheme,
            highlightPlugin,
            blockquotePlugin,
            codeBlockPlugin,
            keymap.of([
                indentWithTab,
                {
                    key: "Insert",
                    run: () => {
                        editorMetrics.toggleInsertMode();
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
            userThemeExtension,

            spellComp.of(createSpellCheckLinter()),

            wrapComp.of([]),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            EditorView.scrollMargins.of(() => ({ bottom: 30 })),
            eventHandlers,
        ];

        if (!filename.endsWith(".txt")) extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));

        extensions.push(
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
                    contentUpdateTimer = window.setTimeout(() => onContentChange(update.state.doc.toString()), CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);
                }
                if (update.docChanged || update.selectionSet) {
                    if (metricsUpdateTimer) clearTimeout(metricsUpdateTimer);
                    metricsUpdateTimer = window.setTimeout(() => {
                        const line = update.state.doc.lineAt(update.state.selection.main.head);
                        onMetricsChange(calculateCursorMetrics(update.state.doc.toString(), update.state.selection.main.head, { number: line.number, from: line.from, text: line.text }));
                    }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
                }
            })
        );

        view = new EditorView({ state: EditorState.create({ doc: initialContent, extensions }), parent: editorContainer });

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

        scrollSync.registerEditor(view);
        view.focus();

        return () => {
            window.removeEventListener("keydown", handleModifierKey);
            window.removeEventListener("keyup", handleModifierKey);
            window.removeEventListener("blur", clearModifier);
            if (view) view.destroy();
        };
    });

    onDestroy(() => {
        if (view) view.destroy();
    });
</script>

<div role="none" class="w-full h-full overflow-hidden bg-[#1e1e1e] relative" bind:this={editorContainer} onclick={() => view?.focus()}></div>
