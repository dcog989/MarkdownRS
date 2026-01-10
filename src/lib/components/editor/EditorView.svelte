<script lang="ts">
    import {
        createDoubleClickHandler,
        createWrapExtension,
        getAutocompletionConfig,
        getEditorKeymap,
    } from "$lib/components/editor/codemirror/config";
    import {
        prefetchHoverHandler,
        smartBacktickHandler,
    } from "$lib/components/editor/codemirror/handlers";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { newlinePlugin, rulerPlugin } from "$lib/utils/editorPlugins";
    import { generateDynamicTheme } from "$lib/utils/editorTheme";
    import { filePathPlugin, filePathTheme } from "$lib/utils/filePathExtension";
    import {
        blockquotePlugin,
        bulletPointPlugin,
        codeBlockPlugin,
        highlightPlugin,
        horizontalRulePlugin,
        inlineCodePlugin,
        urlPlugin,
    } from "$lib/utils/markdownExtensions";
    import { createRecentChangesHighlighter } from "$lib/utils/recentChangesExtension";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { searchState, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { userThemeExtension } from "$lib/utils/themeMapper";
    import { throttle } from "$lib/utils/timing";
    import { closeBrackets, completeAnyWord } from "@codemirror/autocomplete";
    import { history, historyField } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { indentUnit } from "@codemirror/language";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorState } from "@codemirror/state";
    import {
        drawSelection,
        EditorView,
        highlightActiveLine,
        highlightActiveLineGutter,
        highlightWhitespace,
    } from "@codemirror/view";
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
        onHistoryUpdate,
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
        onHistoryUpdate?: (state: any) => void;
        customKeymap?: any[];
        spellCheckLinter: any;
        eventHandlers: any;
        cmView?: EditorView & { getHistoryState?: () => any };
    }>();

    let editorContainer = $state<HTMLDivElement>();
    let view = $state<EditorView & { getHistoryState?: () => any }>();

    // Compartments for dynamic reconfiguration
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

    let autocompletionConfig = $derived(getAutocompletionConfig());

    const markdownExtensions = [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        highlightPlugin,
        blockquotePlugin,
        codeBlockPlugin,
        inlineCodePlugin,
        horizontalRulePlugin,
        bulletPointPlugin,
        urlPlugin,
    ];

    $effect(() => {
        cmView = view;
    });

    // --- Dynamic Configuration Effects ---
    $effect(() => {
        const _ = spellcheckState.customDictionary;
        if (view && spellcheckState.dictionaryLoaded) {
            view.dispatch({ effects: spellComp.reconfigure(createSpellCheckLinter()) });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: [
                    wrapComp.reconfigure(createWrapExtension()),
                    rulerComp.reconfigure(rulerPlugin),
                ],
            });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({ effects: autoComp.reconfigure(autocompletionConfig) });
        }
    });

    $effect(() => {
        if (view) {
            const isDark = appContext.app.theme === "dark";
            view.dispatch({
                effects: themeComp.reconfigure(
                    generateDynamicTheme(
                        appContext.app.editorFontSize,
                        appContext.app.editorFontFamily,
                        isDark,
                        appContext.metrics.insertMode
                    )
                ),
            });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: historyComp.reconfigure(history({ minDepth: appContext.app.undoDepth })),
            });
        }
    });

    $effect(() => {
        if (view) {
            const _indent = appContext.app.defaultIndent;
            view.dispatch({
                effects: indentComp.reconfigure(indentUnit.of(" ".repeat(Math.max(1, _indent)))),
            });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: whitespaceComp.reconfigure(
                    appContext.app.showWhitespace ? [highlightWhitespace(), newlinePlugin] : []
                ),
            });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({ effects: doubleClickComp.reconfigure(createDoubleClickHandler()) });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: languageComp.reconfigure(isMarkdown ? markdownExtensions : []),
            });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({ effects: handlersComp.reconfigure(eventHandlers) });
        }
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: recentComp.reconfigure(createRecentChangesHighlighter(lineChangeTracker)),
            });
        }
    });

    onMount(() => {
        const isDark = appContext.app.theme === "dark";
        const extensions = [
            highlightActiveLineGutter(),
            highlightActiveLine(),
            drawSelection(),
            historyComp.of(history({ minDepth: appContext.app.undoDepth })),
            search({ top: true }),
            highlightSelectionMatches(),
            autoComp.of(autocompletionConfig),
            recentComp.of(createRecentChangesHighlighter(lineChangeTracker)),
            closeBrackets(),
            smartBacktickHandler,
            prefetchHoverHandler,
            EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
            filePathPlugin,
            filePathTheme,
            getEditorKeymap(customKeymap),
            themeComp.of(
                generateDynamicTheme(
                    appContext.app.editorFontSize,
                    appContext.app.editorFontFamily,
                    isDark,
                    appContext.metrics.insertMode
                )
            ),
            indentComp.of(indentUnit.of("  ")),
            whitespaceComp.of(
                appContext.app.showWhitespace ? [highlightWhitespace(), newlinePlugin] : []
            ),
            languageComp.of(isMarkdown ? markdownExtensions : []),
            userThemeExtension,
            spellComp.of(createSpellCheckLinter()),
            doubleClickComp.of(createDoubleClickHandler()),
            rulerComp.of(rulerPlugin),
            wrapComp.of(createWrapExtension()),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            EditorView.scrollMargins.of(() => ({ bottom: 30 })),
            handlersComp.of(eventHandlers),
        ];

        if (initialHistoryState) {
            extensions.push(historyField.init(() => initialHistoryState));
        }

        extensions.push(
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
                    contentUpdateTimer = window.setTimeout(
                        () => onContentChange(update.state.doc.toString()),
                        CONFIG.EDITOR.CONTENT_DEBOUNCE_MS
                    );
                }
                if (update.selectionSet) {
                    if (onSelectionChange) {
                        const sel = update.state.selection.main;
                        onSelectionChange(sel.anchor, sel.head);
                    }
                }
                if (update.docChanged || update.selectionSet) {
                    if (metricsUpdateTimer) clearTimeout(metricsUpdateTimer);
                    metricsUpdateTimer = window.setTimeout(() => {
                        const state = update.view.state;
                        const line = state.doc.lineAt(state.selection.main.head);
                        onMetricsChange(
                            calculateCursorMetrics(
                                state.doc.toString(),
                                state.selection.main.head,
                                { number: line.number, from: line.from, text: line.text }
                            )
                        );
                    }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
                }
            })
        );

        if (!editorContainer) return;

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
        scrollSync.registerEditor(viewInstance);

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

        const throttleScroll = throttle(() => {
            if (!view || !onScrollChange) return;
            const dom = view.scrollDOM;
            const max = dom.scrollHeight - dom.clientHeight;
            const percentage = max > 0 ? dom.scrollTop / max : 0;
            const lineBlock = view.lineBlockAtHeight(dom.scrollTop);
            const docLine = view.state.doc.lineAt(lineBlock.from);
            onScrollChange(percentage, docLine.number);
        }, 100);

        view.scrollDOM.addEventListener("scroll", throttleScroll, { passive: true });

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
            view?.scrollDOM.removeEventListener("scroll", throttleScroll);
            if (onHistoryUpdate && view && view.getHistoryState) {
                onHistoryUpdate(view.getHistoryState());
            }
            if (view) view.destroy();
        };
    });

    onDestroy(() => {
        if (view) view.destroy();
    });
</script>

<div
    role="none"
    class="w-full h-full overflow-hidden bg-bg-main relative"
    bind:this={editorContainer}
    onclick={() => view?.focus()}
></div>
