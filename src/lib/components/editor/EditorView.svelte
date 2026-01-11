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
    import { initializeTabFileState } from "$lib/services/sessionPersistence";
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
    import { ScrollManager } from "$lib/utils/scrollManager";
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
    import { Compartment, EditorState, type Extension } from "@codemirror/state";
    import {
        drawSelection,
        EditorView,
        highlightActiveLine,
        highlightActiveLineGutter,
        highlightWhitespace,
    } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";

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
        cmView?: EditorView & { getHistoryState?: () => any; flushPendingContent?: () => void };
    }>();

    let editorContainer = $state<HTMLDivElement>();
    let view = $state<
        EditorView & { getHistoryState?: () => any; flushPendingContent?: () => void }
    >();

    let scrollManager = new ScrollManager();
    let lastForceSyncCounter = $state(0);

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

    function createExtensions(currentHistoryState: any): Extension[] {
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
            indentComp.of(indentUnit.of(" ".repeat(Math.max(1, appContext.app.defaultIndent)))),
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

        if (currentHistoryState) {
            extensions.push(historyField.init(() => currentHistoryState));
        }

        extensions.push(
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
                    contentUpdateTimer = window.setTimeout(() => {
                        onContentChange(update.state.doc.toString());
                        const v = view as
                            | (EditorView & { getHistoryState?: () => any })
                            | undefined;
                        if (onHistoryUpdate && v && v.getHistoryState) {
                            onHistoryUpdate(v.getHistoryState());
                        }
                    }, CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);
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
                        const docString = state.doc.toString();
                        const line = state.doc.lineAt(state.selection.main.head);

                        // Calculate ONLY cursor metrics to avoid overwriting tab-specific document totals
                        onMetricsChange(
                            calculateCursorMetrics(docString, state.selection.main.head, {
                                number: line.number,
                                from: line.from,
                                text: line.text,
                            })
                        );
                    }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
                }
            })
        );

        return extensions;
    }

    $effect(() => {
        const tId = tabId;
        const storeTab = appContext.editor.tabs.find((t) => t.id === tId);

        if (!view || !storeTab) return;

        const currentDoc = view.state.doc.toString();
        const storeContent = storeTab.content;
        const isLoaded = storeTab.contentLoaded;
        const forceSyncCounter = storeTab.forceSync ?? 0;

        const isInitialPopulate = isLoaded && currentDoc === "" && storeContent !== "";
        const isFocused = view.hasFocus;
        const isForcedSync = forceSyncCounter > lastForceSyncCounter;

        const isTabSwitch = untrack(() => {
            if (view && (view as any)._lastHandledTabId !== tId) {
                (view as any)._lastHandledTabId = tId;
                return true;
            }
            return false;
        });

        if (isTabSwitch) {
            untrack(() => {
                // HARD RESET: Clear current session metrics to force a recalculation
                // in the measure step below, ensuring status bar updates instantly.
                onMetricsChange({
                    cursorOffset: storeTab.cursor.head,
                    cursorLine: 1,
                    cursorCol: 1,
                    currentLineLength: 0,
                    currentWordIndex: 0,
                });

                const newState = EditorState.create({
                    doc: storeContent,
                    extensions: createExtensions(undefined),
                    selection: {
                        anchor: Math.min(initialSelection.anchor, storeContent.length),
                        head: Math.min(initialSelection.head, storeContent.length),
                    },
                });

                view!.setState(newState);

                requestAnimationFrame(() => {
                    if (view && initialScrollPercentage > 0) {
                        const dom = view.scrollDOM;
                        const max = dom.scrollHeight - dom.clientHeight;
                        if (max > 0) dom.scrollTop = initialScrollPercentage * max;
                    }
                    if (view) {
                        view.focus();
                        // Force measure triggers the updateListener which refreshes the metrics
                        view.requestMeasure();
                    }
                    initializeTabFileState(storeTab).catch(() => {});
                });
            });
            return;
        }

        const shouldSync = isInitialPopulate || !isFocused || isForcedSync;

        if (shouldSync && currentDoc !== storeContent) {
            untrack(() => {
                if (isInitialPopulate) {
                    const newState = EditorState.create({
                        doc: storeContent,
                        extensions: createExtensions(undefined),
                        selection: {
                            anchor: Math.min(storeTab.cursor?.anchor ?? 0, storeContent.length),
                            head: Math.min(storeTab.cursor?.head ?? 0, storeContent.length),
                        },
                    });

                    view!.setState(newState);

                    requestAnimationFrame(() => {
                        if (view && initialScrollPercentage > 0) {
                            const dom = view.scrollDOM;
                            const max = dom.scrollHeight - dom.clientHeight;
                            if (max > 0) dom.scrollTop = initialScrollPercentage * max;
                        }
                        if (view) {
                            view.focus();
                            view.requestMeasure();
                        }
                        initializeTabFileState(storeTab).catch(() => {});
                    });
                } else {
                    scrollManager.capture(view!, "Sync");

                    view!.dispatch({
                        changes: { from: 0, to: currentDoc.length, insert: storeContent },
                        selection: undefined,
                        scrollIntoView: false,
                    });

                    requestAnimationFrame(() => {
                        if (view) {
                            view.requestMeasure();
                            scrollManager.restore(view, "pixel");
                        }
                    });
                }

                if (isForcedSync) {
                    lastForceSyncCounter = forceSyncCounter;
                }
            });
        }
    });

    onMount(() => {
        if (!editorContainer) return;

        const safeSelection = {
            anchor: Math.min(initialSelection.anchor, initialContent.length),
            head: Math.min(initialSelection.head, initialContent.length),
        };

        const viewInstance = new EditorView({
            state: EditorState.create({
                doc: initialContent,
                extensions: createExtensions(undefined),
                selection: safeSelection,
            }),
            parent: editorContainer,
        });

        (viewInstance as any).getHistoryState = () => {
            return viewInstance.state.field(historyField, false);
        };
        (viewInstance as any)._lastHandledTabId = tabId;

        (viewInstance as any).flushPendingContent = () => {
            if (contentUpdateTimer) {
                clearTimeout(contentUpdateTimer);
                onContentChange(viewInstance.state.doc.toString());
                if (onHistoryUpdate && (viewInstance as any).getHistoryState) {
                    onHistoryUpdate((viewInstance as any).getHistoryState());
                }
            }
        };

        view = viewInstance as any;
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

        viewInstance.scrollDOM.addEventListener("scroll", throttleScroll, { passive: true });

        if (searchState.findText) {
            updateSearchEditor(viewInstance);
        }

        viewInstance.focus();

        return () => {
            if (contentUpdateTimer) clearTimeout(contentUpdateTimer);
            if (metricsUpdateTimer) clearTimeout(metricsUpdateTimer);
            window.removeEventListener("keydown", handleModifierKey);
            window.removeEventListener("keyup", handleModifierKey);
            window.removeEventListener("blur", clearModifier);
            view?.scrollDOM.removeEventListener("scroll", throttleScroll);

            const v = view;
            if (onHistoryUpdate && v && v.getHistoryState) {
                onHistoryUpdate(v.getHistoryState());
            }
            if (v) v.destroy();
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
