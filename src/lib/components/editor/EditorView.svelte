<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount } from "svelte";

    let {
        tabId,
        initialContent = "",
        filename = "",
        onContentChange,
        onMetricsChange,
        customKeymap = [],
        spellCheckLinter,
        inputHandler,
        eventHandlers,
    } = $props<{
        tabId: string;
        initialContent?: string;
        filename?: string;
        onContentChange: (content: string) => void;
        onMetricsChange: (metrics: any) => void;
        customKeymap?: any[];
        spellCheckLinter: any;
        inputHandler: any;
        eventHandlers: any;
    }>();

    let editorContainer: HTMLDivElement;
    let view = $state<EditorView>();
    let themeCompartment = new Compartment();
    let lineWrappingCompartment = new Compartment();

    // Timer refs
    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;

    const CONTENT_UPDATE_DEBOUNCE_MS = 100;
    const METRICS_UPDATE_DEBOUNCE_MS = 200;

    function clearTimers() {
        if (contentUpdateTimer !== null) {
            clearTimeout(contentUpdateTimer);
            contentUpdateTimer = null;
        }
        if (metricsUpdateTimer !== null) {
            clearTimeout(metricsUpdateTimer);
            metricsUpdateTimer = null;
        }
    }

    function getTheme() {
        const fontSize = appState.editorFontSize || 14;
        const fontFamily = appState.editorFontFamily || "monospace";
        const insertMode = editorStore.activeMetrics.insertMode;

        return EditorView.theme({
            "&": {
                height: "100%",
                fontSize: `${fontSize}px`,
            },
            ".cm-cursor": {
                borderLeftColor: insertMode === "OVR" ? "transparent" : "white",
                borderBottom: insertMode === "OVR" ? "2px solid white" : "none",
            },
            ".cm-scroller": {
                fontFamily: fontFamily,
                overflow: "auto",
            },
            // Adjusted selection style to be more robust
            ".cm-selectionBackground": {
                backgroundColor: "rgba(100, 150, 255, 0.3) !important",
            },
            "&.cm-focused .cm-selectionBackground": {
                backgroundColor: "rgba(100, 150, 255, 0.3) !important",
            },
            ".cm-search": {
                backgroundColor: "var(--bg-panel)",
                borderBottom: "1px solid var(--border-main)",
            },
            ".cm-search input": {
                backgroundColor: "var(--bg-main)",
                color: "var(--fg-default)",
                border: "1px solid var(--border-light)",
            },
            ".cm-search button": {
                backgroundColor: "var(--bg-main)",
                color: "var(--fg-default)",
                border: "1px solid var(--border-light)",
            },
            ".cm-lintRange-warning": {
                backgroundImage: "none",
                borderBottom: "2px dotted var(--danger)",
                position: "relative",
                zIndex: "1",
            },
        });
    }

    // Effect to handle Theme and Font changes
    $effect(() => {
        const newTheme = getTheme();
        if (view) {
            view.dispatch({
                effects: themeCompartment.reconfigure(newTheme),
            });
        }
    });

    // Effect to handle word wrap changes
    $effect(() => {
        const wordWrap = appState.editorWordWrap;
        if (view) {
            view.dispatch({
                effects: lineWrappingCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
            });
        }
    });

    onMount(() => {
        const builtInKeymap = [
            {
                key: "Insert",
                run: () => {
                    editorStore.toggleInsertMode();
                    return true;
                },
            },
            {
                key: "Mod-End",
                run: (view: EditorView) => {
                    const doc = view.state.doc;
                    view.dispatch({
                        selection: EditorSelection.cursor(doc.length),
                        scrollIntoView: true,
                        userEvent: "select",
                    });
                    return true;
                },
            },
            {
                key: "Mod-Home",
                run: (view: EditorView) => {
                    view.dispatch({
                        selection: EditorSelection.cursor(0),
                        scrollIntoView: true,
                        userEvent: "select",
                    });
                    return true;
                },
            },
        ];

        const extensions = [lineNumbers(), highlightActiveLineGutter(), history(), search({ top: true }), highlightSelectionMatches(), keymap.of([...builtInKeymap, ...customKeymap, ...defaultKeymap, ...historyKeymap]), oneDark, spellCheckLinter, lineWrappingCompartment.of(appState.editorWordWrap ? EditorView.lineWrapping : []), EditorView.contentAttributes.of({ spellcheck: "false" }), inputHandler, eventHandlers, themeCompartment.of(getTheme())];

        if (!filename.endsWith(".txt")) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                // Check if user event to trigger debounce
                const isUserUpdate = update.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("undo") || tr.isUserEvent("redo") || tr.isUserEvent("move"));

                if (isUserUpdate) {
                    if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
                    contentUpdateTimer = window.setTimeout(() => {
                        onContentChange(update.state.doc.toString());
                        contentUpdateTimer = null;
                    }, CONTENT_UPDATE_DEBOUNCE_MS);
                } else {
                    if (contentUpdateTimer !== null) {
                        clearTimeout(contentUpdateTimer);
                        contentUpdateTimer = null;
                    }
                }
            }
            if (update.docChanged || update.selectionSet) {
                if (metricsUpdateTimer !== null) clearTimeout(metricsUpdateTimer);
                metricsUpdateTimer = window.setTimeout(() => {
                    const doc = update.state.doc;
                    const selection = update.state.selection.main;
                    const cursorLine = doc.lineAt(selection.head);
                    const text = doc.toString();
                    const trimmedText = text.trim();
                    const wordCount = trimmedText === "" ? 0 : trimmedText.split(/\s+/).length;
                    const sizeKB = new TextEncoder().encode(text).length / 1024;

                    onMetricsChange({
                        lineCount: doc.lines,
                        wordCount: wordCount,
                        charCount: text.length,
                        cursorOffset: selection.head,
                        sizeKB: sizeKB,
                        cursorLine: cursorLine.number,
                        cursorCol: selection.head - cursorLine.from + 1,
                    });
                    metricsUpdateTimer = null;
                }, METRICS_UPDATE_DEBOUNCE_MS);
            }
        });

        extensions.push(updateListener);

        const state = EditorState.create({
            doc: initialContent,
            extensions: extensions,
        });

        view = new EditorView({
            state,
            parent: editorContainer,
        });

        const handleWindowFocus = () => {
            if (view && !view.hasFocus) view.focus();
        };
        window.addEventListener("focus", handleWindowFocus);
        view.focus();

        return () => {
            window.removeEventListener("focus", handleWindowFocus);
            clearTimers();
            if (view) view.destroy();
        };
    });

    onDestroy(() => {
        clearTimers();
        if (view) view.destroy();
    });

    export function getView() {
        return view;
    }

    export function getScrollDOM() {
        return view?.scrollDOM;
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div role="none" class="w-full h-full overflow-hidden bg-[#1e1e1e] relative" bind:this={editorContainer} onclick={() => view?.focus()}></div>

<style>
    :global(.cm-scroller) {
        scrollbar-width: none;
    }
    :global(.cm-scroller::-webkit-scrollbar) {
        display: none;
    }
</style>
