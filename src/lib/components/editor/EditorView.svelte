<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, MatchDecorator, ViewPlugin } from "@codemirror/view";
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
    let autocompleteCompartment = new Compartment();

    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;

    const CONTENT_UPDATE_DEBOUNCE_MS = 80;
    const METRICS_UPDATE_DEBOUNCE_MS = 80;

    function clearTimers() {
        if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
        if (metricsUpdateTimer !== null) clearTimeout(metricsUpdateTimer);
    }

    function completeFromBuffer(context: CompletionContext) {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        if (word.text.length < 3) return null;

        const text = context.state.doc.toString();
        const options = new Set<string>();
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

    let validatedFontFamily = $derived.by(() => {
        let family = appState.editorFontFamily || "monospace";
        family = family.trim();
        if (family.endsWith(",")) family = family.slice(0, -1).trim();

        const singleQuotes = (family.match(/'/g) || []).length;
        const doubleQuotes = (family.match(/"/g) || []).length;

        if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return "monospace";
        return family;
    });

    let dynamicTheme = $derived.by(() => {
        const fontSize = appState.editorFontSize || 14;
        const insertMode = editorStore.insertMode;
        const fontFamily = validatedFontFamily;

        return EditorView.theme({
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
            ".cm-content": {
                paddingBottom: "30px !important",
            },
            ".cm-local-path": {
                color: "var(--color-accent-link)",
                textDecoration: "underline",
                cursor: "pointer",
            },
            /* Current Line Highlight */
            ".cm-activeLine": {
                backgroundColor: "var(--color-bg-input) !important",
                mixBlendMode: "normal",
            },
            ".cm-activeLineGutter": {
                backgroundColor: "var(--color-bg-panel) !important",
            },
            /* Explicit Spellcheck Squiggles */
            ".cm-lintRange-error": {
                backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3">%3Cpath d="M0 2.5 L1.5 1 L3 2.5 L4.5 1 L6 2.5" stroke="%23ff6b6b" stroke-width="1" fill="none"/%3E</svg>')`,
                backgroundRepeat: "repeat-x",
                backgroundPosition: "bottom",
                paddingBottom: "1px",
                borderBottom: "none",
            },
            ".cm-tooltip": {
                borderRadius: "6px !important",
                zIndex: "100",
                opacity: "0",
                animation: "cm-tooltip-fade-in 0.15s cubic-bezier(0.2, 0, 0.2, 1) forwards",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
                backgroundColor: "var(--color-bg-panel) !important",
                border: "1px solid var(--color-border-light) !important",
                color: "var(--color-fg-default) !important",
            },
            ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
                backgroundColor: "var(--color-accent-primary) !important",
                color: "var(--color-fg-inverse) !important",
            },
        });
    });

    $effect(() => {
        const baseTheme = appState.theme === "dark" ? oneDark : [];
        if (view) {
            view.dispatch({
                effects: themeCompartment.reconfigure([baseTheme, dynamicTheme]),
            });
        }
    });

    $effect(() => {
        const wordWrap = appState.editorWordWrap;
        if (view) {
            view.dispatch({
                effects: lineWrappingCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
            });
        }
    });

    $effect(() => {
        const enable = appState.enableAutocomplete;
        if (view) {
            view.dispatch({
                effects: autocompleteCompartment.reconfigure(enable ? autocompletion({ override: [completeFromBuffer] }) : []),
            });
        }
    });

    onMount(() => {
        const pathDecorator = new MatchDecorator({
            regexp: /(?:[a-zA-Z]:[\\\/]|[\\\/]|\.?\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}'~`+]+/g,
            decoration: Decoration.mark({ class: "cm-local-path" }),
        });

        const pathHighlighter = ViewPlugin.fromClass(
            class {
                decorations: any;
                constructor(view: EditorView) {
                    this.decorations = pathDecorator.createDeco(view);
                }
                update(update: any) {
                    this.decorations = pathDecorator.updateDeco(update, this.decorations);
                }
            },
            {
                decorations: (v) => v.decorations,
            }
        );

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
                    const pos = view.state.doc.length;
                    view.dispatch({
                        selection: EditorSelection.cursor(pos),
                        effects: EditorView.scrollIntoView(pos, { y: "end", yMargin: 40 }),
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
                        effects: EditorView.scrollIntoView(0, { y: "start" }),
                        userEvent: "select",
                    });
                    return true;
                },
            },
        ];

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(), // Added
            history(),
            search({ top: true }),
            highlightSelectionMatches(),
            pathHighlighter,
            autocompleteCompartment.of(appState.enableAutocomplete ? autocompletion({ override: [completeFromBuffer] }) : []),
            closeBrackets(),
            keymap.of([...builtInKeymap, ...customKeymap, ...completionKeymap, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
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
                }
            }

            if (update.docChanged || update.selectionSet) {
                if (metricsUpdateTimer !== null) clearTimeout(metricsUpdateTimer);
                metricsUpdateTimer = window.setTimeout(async () => {
                    const doc = update.state.doc;
                    const selection = update.state.selection.main;
                    const line = doc.lineAt(selection.head);
                    const text = doc.toString();

                    // Direct TypeScript calculation - No IPC call
                    const metrics = calculateCursorMetrics(text, selection.head, {
                        number: line.number,
                        from: line.from,
                        text: line.text,
                    });

                    onMetricsChange(metrics);
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
        scroll-behavior: smooth;
    }
    :global(.cm-scroller::-webkit-scrollbar) {
        display: none;
    }
</style>
