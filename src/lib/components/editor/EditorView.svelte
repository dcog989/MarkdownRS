<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { logScroll } from "$lib/utils/diagnostics";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { createRecentChangesHighlighter, trackEditorChanges } from "$lib/utils/recentChangesExtension";
    import { calculateCursorMetrics } from "$lib/utils/textMetrics";
    import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { highlightSelectionMatches, search } from "@codemirror/search";
    import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
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

    // Sync Lock State
    let isRemoteScrolling = false;
    let remoteScrollTimeout: number | null = null;
    let scrollRaf: number | null = null;

    $effect(() => {
        cmView = view;
    });

    let themeCompartment = new Compartment();
    let lineWrappingCompartment = new Compartment();
    let autocompleteCompartment = new Compartment();
    let recentChangesCompartment = new Compartment();

    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;

    const lineChangeTracker = new LineChangeTracker();

    const CONTENT_UPDATE_DEBOUNCE_MS = 80;
    const METRICS_UPDATE_DEBOUNCE_MS = 80;

    function clearTimers() {
        if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
        if (metricsUpdateTimer !== null) clearTimeout(metricsUpdateTimer);
        if (remoteScrollTimeout !== null) clearTimeout(remoteScrollTimeout);
        if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
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
        return appState.editorFontFamily || "monospace";
    });

    let dynamicTheme = $derived.by(() => {
        const fontSize = appState.editorFontSize || 14;
        const insertMode = editorStore.insertMode;

        return EditorView.theme({
            "&": { height: "100%", fontSize: `${fontSize}px` },
            ".cm-cursor": {
                borderLeftColor: insertMode === "OVR" ? "transparent" : "var(--color-fg-default)",
                borderBottom: insertMode === "OVR" ? "2px solid var(--color-accent-secondary)" : "none",
            },
            ".cm-scroller": { fontFamily: validatedFontFamily, overflow: "auto" },
            ".cm-content": { paddingBottom: "40px !important" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
                backgroundColor: "color-mix(in srgb, var(--color-accent-secondary), transparent 25%) !important",
            },
            ".cm-local-path": { color: "var(--color-accent-link)", textDecoration: "underline", cursor: "pointer" },
            ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-bg-main), var(--color-fg-default) 4%) !important" },
            ".cm-activeLineGutter": { backgroundColor: "var(--color-bg-panel) !important" },
            ".cm-tooltip": {
                borderRadius: "6px !important",
                zIndex: "100",
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
        if (view) view.dispatch({ effects: themeCompartment.reconfigure([appState.theme === "dark" ? oneDark : [], dynamicTheme]) });
    });

    $effect(() => {
        if (view) view.dispatch({ effects: lineWrappingCompartment.reconfigure(appState.editorWordWrap ? EditorView.lineWrapping : []) });
    });

    $effect(() => {
        if (view) view.dispatch({ effects: autocompleteCompartment.reconfigure(appState.enableAutocomplete ? autocompletion({ override: [completeFromBuffer] }) : []) });
    });

    $effect(() => {
        if (view && appState.highlightRecentChanges) {
            view.dispatch({ effects: recentChangesCompartment.reconfigure(createRecentChangesHighlighter(lineChangeTracker)) });
        }
    });

    onMount(() => {
        const pathDecorator = new MatchDecorator({
            regexp: /(?:(?:^|\s)(?:[a-zA-Z]:[\\\/]|[\\\/]|\.\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]+)/g,
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
            { decorations: (v) => v.decorations }
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
                    if (view.scrollDOM) view.scrollDOM.style.scrollBehavior = "auto";
                    const pos = view.state.doc.length;
                    view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: "end" }), userEvent: "select" });
                    requestAnimationFrame(() => {
                        if (view.scrollDOM) {
                            view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
                            requestAnimationFrame(() => {
                                if (view.scrollDOM) view.scrollDOM.style.scrollBehavior = "";
                            });
                        }
                    });
                    return true;
                },
            },
            {
                key: "Mod-Home",
                run: (view: EditorView) => {
                    if (view.scrollDOM) view.scrollDOM.style.scrollBehavior = "auto";
                    view.dispatch({ selection: EditorSelection.cursor(0), effects: EditorView.scrollIntoView(0, { y: "start" }), userEvent: "select" });
                    requestAnimationFrame(() => {
                        if (view.scrollDOM) {
                            view.scrollDOM.scrollTop = 0;
                            requestAnimationFrame(() => {
                                if (view.scrollDOM) view.scrollDOM.style.scrollBehavior = "";
                            });
                        }
                    });
                    return true;
                },
            },
            defaultKeymap,
        ].flat();

        // --- DOM HANDLERS ---
        const wrappedEventHandlers = {
            ...eventHandlers,
            mousedown: (event: MouseEvent, view: EditorView) => {
                if (eventHandlers?.mousedown) eventHandlers.mousedown(event, view);

                // Path Navigation Logic
                if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                    if (pos !== null) {
                        const line = view.state.doc.lineAt(pos);
                        const pathRegex = /(?:(?:^|\s)(?:[a-zA-Z]:[\\\/]|[\\\/]|\.\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]+)/g;
                        let match;
                        while ((match = pathRegex.exec(line.text)) !== null) {
                            const trimmedMatch = match[0].trim();
                            const start = line.from + match.index + (match[0].length - trimmedMatch.length);
                            const end = start + trimmedMatch.length;
                            if (pos >= start && pos <= end) {
                                navigateToPath(trimmedMatch);
                                return true;
                            }
                        }
                    }
                }
                return false;
            },
            scroll: (event: Event, view: EditorView) => {
                if (eventHandlers?.scroll) eventHandlers.scroll(event, view);

                // Lock Check: Only sync if not currently being driven remotely
                if (isRemoteScrolling) return;

                if (scrollRaf) cancelAnimationFrame(scrollRaf);
                scrollRaf = requestAnimationFrame(() => {
                    const dom = view.scrollDOM;
                    const maxScroll = dom.scrollHeight - dom.clientHeight;
                    const scrollTop = dom.scrollTop;

                    let preciseLine = 1;
                    let percentage = 0;

                    if (maxScroll > 0) {
                        percentage = scrollTop / maxScroll;

                        // Aggressive top snap check
                        if (scrollTop < 5) {
                            preciseLine = 1;
                        } else if (Math.abs(scrollTop - maxScroll) < 10) {
                            preciseLine = view.state.doc.lines;
                        } else {
                            const lineBlock = view.lineBlockAtHeight(scrollTop);
                            const lineNum = view.state.doc.lineAt(lineBlock.from).number;
                            const progress = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
                            preciseLine = lineNum + progress;
                        }
                    }

                    logScroll("Editor", "Scroll Source (Calc)", { scrollTop, preciseLine });
                    editorStore.updateScroll(tabId, percentage, preciseLine, "editor");
                    scrollRaf = null;
                });
            },
        };

        const domHandlers = EditorView.domEventHandlers(wrappedEventHandlers);

        const extensions = [highlightActiveLineGutter(), highlightActiveLine(), history(), search({ top: true }), highlightSelectionMatches(), pathHighlighter, autocompleteCompartment.of(appState.enableAutocomplete ? autocompletion({ override: [completeFromBuffer] }) : []), recentChangesCompartment.of(createRecentChangesHighlighter(lineChangeTracker)), closeBrackets(), keymap.of([...builtInKeymap, ...customKeymap, ...completionKeymap, ...closeBracketsKeymap, ...historyKeymap]), themeCompartment.of([]), spellCheckLinter, lineWrappingCompartment.of(appState.editorWordWrap ? EditorView.lineWrapping : []), EditorView.contentAttributes.of({ spellcheck: "false" }), EditorView.scrollMargins.of(() => ({ bottom: 30 })), inputHandler, domHandlers];

        if (!filename.endsWith(".txt")) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            trackEditorChanges(lineChangeTracker, update);
            if (update.docChanged) {
                if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
                contentUpdateTimer = window.setTimeout(() => {
                    onContentChange(update.state.doc.toString());
                }, CONTENT_UPDATE_DEBOUNCE_MS);
            }
            if (update.docChanged || update.selectionSet) {
                if (metricsUpdateTimer !== null) clearTimeout(metricsUpdateTimer);
                metricsUpdateTimer = window.setTimeout(() => {
                    const doc = update.state.doc;
                    const selection = update.state.selection.main;
                    const line = doc.lineAt(selection.head);
                    onMetricsChange(calculateCursorMetrics(doc.toString(), selection.head, { number: line.number, from: line.from, text: line.text }));
                }, METRICS_UPDATE_DEBOUNCE_MS);
            }
        });

        extensions.push(updateListener);

        const state = EditorState.create({ doc: initialContent, extensions });
        view = new EditorView({ state, parent: editorContainer });

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

    // --- SCROLL RECEIVER ---
    $effect(() => {
        if (!cmView || !cmView.scrollDOM) return;

        const currentTabState = editorStore.tabs.find((t) => t.id === tabId);

        if (editorStore.lastScrollSource === "editor") return;

        const targetLine = currentTabState?.topLine;
        if (targetLine === undefined) return;

        const dom = cmView.scrollDOM;

        // Engage Lock
        isRemoteScrolling = true;

        // Force instant scroll for sync (overrides CSS smooth)
        dom.style.scrollBehavior = "auto";

        try {
            if (targetLine <= 1.05) {
                dom.scrollTop = 0;
            } else if (targetLine >= editorStore.lineCount - 0.5) {
                dom.scrollTop = dom.scrollHeight;
            } else {
                const lineInt = Math.floor(targetLine);
                const progress = targetLine - lineInt;
                const lineBlock = cmView.lineBlockAt(cmView.state.doc.line(lineInt).from);

                // Exact alignment logic:
                // CodeMirror's top padding is usually small (4px), but checking `documentPadding` ensures correctness.
                const topPadding = cmView.documentPadding.top || 0;
                dom.scrollTop = lineBlock.top + lineBlock.height * progress - topPadding;
            }
        } catch (e) {
            // Fallback
        }

        // Release lock
        if (remoteScrollTimeout) clearTimeout(remoteScrollTimeout);
        remoteScrollTimeout = window.setTimeout(() => {
            isRemoteScrolling = false;
            dom.style.scrollBehavior = "";
        }, 100);
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
