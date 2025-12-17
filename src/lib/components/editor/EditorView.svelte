<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
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

    // Compartments for dynamic reconfiguration
    let themeCompartment = new Compartment();
    let lineWrappingCompartment = new Compartment();
    let autocompleteCompartment = new Compartment();

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

    // Autocomplete Source: Simple Buffer Completion
    function completeFromBuffer(context: CompletionContext) {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        if (word.text.length < 3) return null; // Minimum length to trigger

        const text = context.state.doc.toString();
        const options = new Set<string>();
        // Match words with 3+ chars
        const re = /\w{3,}/g;
        let m;
        while ((m = re.exec(text))) {
            if (m[0] !== word.text) options.add(m[0]);
        }

        return {
            from: word.from,
            options: Array.from(options).map((label) => ({ label, type: "text" })),
            validFor: /^\w*$/,
        };
    }

    // Memoize theme generation
    let lastFontSize = 0;
    let lastFontFamily = "";
    let lastInsertMode: "INS" | "OVR" = "INS";
    let cachedDynamicStyles: any = null;

    function getDynamicStyles() {
        const fontSize = appState.editorFontSize || 14;
        let fontFamily = appState.editorFontFamily || "monospace";
        const insertMode = editorStore.activeMetrics.insertMode;

        // 1. Sanitize: Trim whitespace
        fontFamily = fontFamily.trim();

        // 2. Sanitize: Remove trailing comma if present (common when typing lists)
        if (fontFamily.endsWith(",")) {
            fontFamily = fontFamily.slice(0, -1).trim();
        }

        // 3. Safety Check: Detect unbalanced quotes
        // Unclosed quotes in a CSS value can break the entire stylesheet by consuming closing braces.
        const singleQuotes = (fontFamily.match(/'/g) || []).length;
        const doubleQuotes = (fontFamily.match(/"/g) || []).length;

        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
            // Unsafe CSS detected (e.g. user is typing "'Source...").
            // If we have a valid cache, return it to maintain previous styling while typing.
            if (cachedDynamicStyles) return cachedDynamicStyles;
            // If no cache (e.g. startup with bad config), force a safe fallback to prevent broken UI
            fontFamily = "monospace";
        }

        // 4. Cache Check
        if (cachedDynamicStyles && fontSize === lastFontSize && fontFamily === lastFontFamily && insertMode === lastInsertMode) {
            return cachedDynamicStyles;
        }

        // 5. Update Cache State
        lastFontSize = fontSize;
        lastFontFamily = fontFamily;
        lastInsertMode = insertMode;

        cachedDynamicStyles = EditorView.theme({
            "&": {
                height: "100%",
                fontSize: `${fontSize}px`,
            },
            ".cm-cursor": {
                borderLeftColor: insertMode === "OVR" ? "transparent" : "auto",
                borderBottom: insertMode === "OVR" ? "2px solid currentColor" : "none",
            },
            ".cm-scroller": {
                fontFamily: fontFamily,
                overflow: "auto",
            },
            // Autocomplete Tooltip Styling
            ".cm-tooltip": {
                borderRadius: "6px !important",
                zIndex: "100",
                opacity: "0",
                animation: "cm-tooltip-fade-in 0.15s cubic-bezier(0.2, 0, 0.2, 1) forwards",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
            },
            ".cm-tooltip.cm-tooltip-autocomplete": {
                "& > ul": {
                    borderRadius: "4px",
                },
            },
            ".cm-tooltip-autocomplete > ul > li": {
                padding: "4px 8px !important",
                fontFamily: "var(--font-sans)",
                fontSize: "0.9em",
            },
            ".cm-completionIcon": {
                display: "none", // Hide icons for cleaner look
            },
        });

        return cachedDynamicStyles;
    }

    // Effect: Theme and Font changes
    $effect(() => {
        const dynamicStyles = getDynamicStyles();
        const baseTheme = appState.theme === "dark" ? oneDark : [];

        if (view) {
            view.dispatch({
                effects: themeCompartment.reconfigure([baseTheme, dynamicStyles]),
            });
        }
    });

    // Effect: Word wrap changes
    $effect(() => {
        const wordWrap = appState.editorWordWrap;
        if (view) {
            view.dispatch({
                effects: lineWrappingCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
            });
        }
    });

    // Effect: Autocomplete enable/disable
    $effect(() => {
        const enable = appState.enableAutocomplete;
        if (view) {
            view.dispatch({
                effects: autocompleteCompartment.reconfigure(enable ? autocompletion({ override: [completeFromBuffer] }) : []),
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

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            search({ top: true }),
            highlightSelectionMatches(),
            // Autocomplete compartment
            autocompleteCompartment.of(appState.enableAutocomplete ? autocompletion({ override: [completeFromBuffer] }) : []),
            closeBrackets(),
            keymap.of([...builtInKeymap, ...customKeymap, ...completionKeymap, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
            // Theme compartment - Start with default placeholder, effect will configure immediately
            themeCompartment.of([]),
            spellCheckLinter,
            lineWrappingCompartment.of(appState.editorWordWrap ? EditorView.lineWrapping : []),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            inputHandler,
            eventHandlers,
        ];

        if (!filename.endsWith(".txt")) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
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
