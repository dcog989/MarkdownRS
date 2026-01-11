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
        initialScrollTop = 0,
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
        initialScrollTop?: number;
        initialSelection?: { anchor: number; head: number };
        initialHistoryState?: any;
        lineChangeTracker: any;
        onContentChange: (content: string) => void;
        onMetricsChange: (metrics: any) => void;
        onScrollChange?: (percentage: number, scrollTop: number, topLine: number) => void;
        onSelectionChange?: (anchor: number, head: number) => void;
        onHistoryUpdate?: (state: any) => void;
        customKeymap?: any[];
        spellCheckLinter: any;
        eventHandlers: any;
        cmView?: EditorView & {
            getHistoryState?: () => any;
            flushPendingContent?: () => void;
            _currentTabId?: string;
        };
    }>();

    let editorContainer = $state<HTMLDivElement>();
    let view = $state<
        EditorView & {
            getHistoryState?: () => any;
            flushPendingContent?: () => void;
            _currentTabId?: string;
        }
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

        const isTabSwitch = untrack(() => {
            if (view && view._currentTabId !== tId) {
                view._currentTabId = tId;
                return true;
            }
            return false;
        });

        const currentDoc = view.state.doc.toString();
        const storeContent = storeTab.content;
        const isLoaded = storeTab.contentLoaded;
        const forceSyncCounter = storeTab.forceSync ?? 0;

        if (isTabSwitch) {
            untrack(() => {
                const newState = EditorState.create({
                    doc: storeContent,
                    extensions: createExtensions(storeTab.historyState),
                    selection: {
                        anchor: Math.min(storeTab.cursor.anchor, storeContent.length),
                        head: Math.min(storeTab.cursor.head, storeContent.length),
                    },
                });

                view!.setState(newState);

                const cursorPos = Math.min(storeTab.cursor.head, storeContent.length);
                const line = newState.doc.lineAt(cursorPos);
                onMetricsChange(
                    calculateCursorMetrics(storeContent, cursorPos, {
                        number: line.number,
                        from: line.from,
                        text: line.text,
                    })
                );

                view!.requestMeasure({
                    read: () => {},
                    write: () => {
                        if (view && view._currentTabId === tId) {
                            view.scrollDOM.scrollTop = storeTab.scrollTop ?? 0;
                        }
                    },
                });

                initializeTabFileState(storeTab).catch(() => {});
            });
            return;
        }

        const isInitialPopulate = isLoaded && currentDoc === "" && storeContent !== "";
        const isFocused = view.hasFocus;
        const isForcedSync = forceSyncCounter > lastForceSyncCounter;
        const shouldSync =
            isInitialPopulate || (!isFocused && currentDoc !== storeContent) || isForcedSync;

        if (shouldSync) {
            untrack(() => {
                scrollManager.capture(view!, "Sync");

                view!.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: storeContent },
                    userEvent: "input.type.sync",
                });

                requestAnimationFrame(() => {
                    if (view && view._currentTabId === tId) {
                        view.requestMeasure();
                        scrollManager.restore(view, "pixel");
                    }
                });

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
                extensions: createExtensions(initialHistoryState),
                selection: safeSelection,
            }),
            parent: editorContainer,
        });

        const typedView = viewInstance as any;
        typedView.getHistoryState = () => typedView.state.field(historyField, false);
        typedView._currentTabId = tabId;

        typedView.flushPendingContent = () => {
            if (contentUpdateTimer) {
                clearTimeout(contentUpdateTimer);
                onContentChange(typedView.state.doc.toString());
                if (onHistoryUpdate && typedView.getHistoryState) {
                    onHistoryUpdate(typedView.getHistoryState());
                }
            }
        };

        view = typedView;
        scrollSync.registerEditor(viewInstance);

        viewInstance.requestMeasure({
            read: () => {},
            write: () => {
                viewInstance.scrollDOM.scrollTop = initialScrollTop;
            },
        });

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
            if (!view || !onScrollChange || view._currentTabId !== tabId) return;

            const dom = view.scrollDOM;
            const max = dom.scrollHeight - dom.clientHeight;
            const percentage = max > 0 ? dom.scrollTop / max : 0;
            const scrollTop = dom.scrollTop;

            const lineBlock = view.lineBlockAtHeight(scrollTop);
            const docLine = view.state.doc.lineAt(lineBlock.from);
            onScrollChange(percentage, scrollTop, docLine.number);
        }, 50);

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
