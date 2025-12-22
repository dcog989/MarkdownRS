<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorMetrics } from "$lib/stores/editorMetrics.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { filePathPlugin, filePathTheme } from "$lib/utils/filePathExtension";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { createRecentChangesHighlighter, trackEditorChanges } from "$lib/utils/recentChangesExtension";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { userThemeExtension } from "$lib/utils/themeMapper";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorState } from "@codemirror/state";
    import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap } from "@codemirror/view";
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
    let wrapComp = new Compartment(),
        autoComp = new Compartment(),
        recentComp = new Compartment(),
        historyComp = new Compartment();
    let contentUpdateTimer: number | null = null,
        metricsUpdateTimer: number | null = null;
    const lineChangeTracker = new LineChangeTracker();

    $effect(() => {
        cmView = view;
    });

    let dynamicTheme = $derived.by(() => {
        const fontSize = appState.editorFontSize || 14;
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
                backgroundColor: "rgba(255, 213, 0, 0.25)",
                outline: "1px solid rgba(255, 213, 0, 0.5)",
                borderRadius: "2px",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
                backgroundColor: "rgba(255, 153, 0, 0.4)",
                outline: "1px solid rgba(255, 153, 0, 0.8)",
            },
            ".cm-tooltip": {
                backgroundColor: "var(--color-bg-panel)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-fg-default)",
            },
            ".cm-tooltip.cm-tooltip-lint": {
                backgroundColor: "var(--color-bg-panel)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-fg-default)",
            },
        });
    });

    $effect(() => {
        if (view)
            view.dispatch({
                effects: [wrapComp.reconfigure(appState.editorWordWrap ? EditorView.lineWrapping : []), autoComp.reconfigure(appState.enableAutocomplete ? autocompletion() : []), recentComp.reconfigure(appState.recentChangesMode !== "disabled" ? createRecentChangesHighlighter(lineChangeTracker) : []), historyComp.reconfigure(history({ minDepth: appState.undoDepth }))],
            });
    });

    onMount(() => {
        const extensions = [
            highlightActiveLineGutter(),
            highlightActiveLine(),
            historyComp.of(history({ minDepth: appState.undoDepth })),
            search({ top: true }),
            highlightSelectionMatches(),
            autoComp.of([]),
            recentComp.of([]),
            closeBrackets(),
            filePathPlugin,
            filePathTheme,
            keymap.of([
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
            dynamicTheme,
            userThemeExtension,
            spellCheckLinter,
            wrapComp.of([]),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            EditorView.scrollMargins.of(() => ({ bottom: 30 })),
            eventHandlers,
        ];

        if (!filename.endsWith(".txt")) extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));

        extensions.push(
            EditorView.updateListener.of((update) => {
                trackEditorChanges(lineChangeTracker, update);
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
        scrollSync.registerEditor(view);
        view.focus();
        return () => {
            if (view) view.destroy();
        };
    });

    onDestroy(() => {
        if (view) view.destroy();
    });
</script>

<div role="none" class="w-full h-full overflow-hidden bg-[#1e1e1e] relative" bind:this={editorContainer} onclick={() => view?.focus()}></div>
