<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { createRecentChangesHighlighter, trackEditorChanges } from "$lib/utils/recentChangesExtension";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { userThemeExtension } from "$lib/utils/themeMapper";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorState } from "@codemirror/state";
    import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, MatchDecorator, ViewPlugin } from "@codemirror/view";
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
        cmView = $bindable(),
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
        cmView?: EditorView;
    }>();

    let editorContainer: HTMLDivElement;
    let view = $state<EditorView>();

    $effect(() => {
        cmView = view;
    });

    let themeComp = new Compartment();
    let wrapComp = new Compartment();
    let autoComp = new Compartment();
    let recentComp = new Compartment();

    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;
    const lineChangeTracker = new LineChangeTracker();

    function completeFromBuffer(context: CompletionContext) {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        if (word.text.length < 3) return null;
        const text = context.state.doc.toString();
        const options = new Set<string>();
        const re = /\w{3,}/g;
        let m;
        while ((m = re.exec(text))) if (m[0] !== word.text) options.add(m[0]);
        return { from: word.from, options: Array.from(options).map((label) => ({ label, type: "text" })), validFor: /^\w*$/ };
    }

    let dynamicTheme = $derived.by(() => {
        const fontSize = appState.editorFontSize || 14;
        const insertMode = editorStore.insertMode;
        return EditorView.theme({
            "&": { height: "100%", fontSize: `${fontSize}px` },
            ".cm-cursor": {
                borderLeftColor: insertMode === "OVR" ? "transparent" : "var(--color-fg-default)",
                borderBottom: insertMode === "OVR" ? "2px solid var(--color-accent-secondary)" : "none",
            },
            ".cm-scroller": { fontFamily: appState.editorFontFamily, overflow: "auto" },
            ".cm-content": { paddingBottom: "40px !important" },
            ".cm-gutters": { border: "none" },
            ".cm-tooltip": { borderRadius: "6px !important", zIndex: "100", backgroundColor: "var(--color-bg-panel) !important", border: "1px solid var(--color-border-light) !important", color: "var(--color-fg-default) !important" },
            ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--color-accent-primary) !important", color: "var(--color-fg-inverse) !important" },
        });
    });

    $effect(() => {
        if (view) {
            view.dispatch({
                effects: [themeComp.reconfigure(dynamicTheme), wrapComp.reconfigure(appState.editorWordWrap ? EditorView.lineWrapping : []), autoComp.reconfigure(appState.enableAutocomplete ? autocompletion({ override: [completeFromBuffer] }) : []), recentComp.reconfigure(appState.highlightRecentChanges ? createRecentChangesHighlighter(lineChangeTracker) : [])],
            });
        }
    });

    onMount(() => {
        const pathDecorator = new MatchDecorator({ regexp: /(?:(?:^|\s)(?:[a-zA-Z]:[\\\/]|[\\\/]|\.\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]+)/g, decoration: Decoration.mark({ class: "cm-local-path" }) });
        const pathHighlighter = ViewPlugin.fromClass(
            class {
                decorations: any;
                constructor(v: EditorView) {
                    this.decorations = pathDecorator.createDeco(v);
                }
                update(u: any) {
                    this.decorations = pathDecorator.updateDeco(u, this.decorations);
                }
            },
            { decorations: (v) => v.decorations }
        );

        const extensions = [
            highlightActiveLineGutter(),
            highlightActiveLine(),
            history(),
            search({ top: true }),
            highlightSelectionMatches(),
            pathHighlighter,
            autoComp.of([]),
            recentComp.of([]),
            closeBrackets(),
            keymap.of([
                {
                    key: "Insert",
                    run: () => {
                        editorStore.toggleInsertMode();
                        return true;
                    },
                },
                ...customKeymap,
                ...completionKeymap,
                ...closeBracketsKeymap,
                ...historyKeymap,
                ...defaultKeymap,
            ]),
            themeComp.of([dynamicTheme]),
            userThemeExtension,
            spellCheckLinter,
            wrapComp.of([]),
            EditorView.contentAttributes.of({ spellcheck: "false" }),
            EditorView.scrollMargins.of(() => ({ bottom: 30 })),
            inputHandler,
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
                        const doc = update.state.doc;
                        const selection = update.state.selection.main;
                        const line = doc.lineAt(selection.head);
                        onMetricsChange(calculateCursorMetrics(doc.toString(), selection.head, { number: line.number, from: line.from, text: line.text }));
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

<style>
    :global(.cm-scroller) {
        scrollbar-width: none;
    }
    :global(.cm-scroller::-webkit-scrollbar) {
        display: none;
    }
</style>
