<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;
    let contentUpdateTimer: number | null = null;
    let scrollUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;
    let previousTabId: string = "";

    function clearAllTimers() {
        if (contentUpdateTimer !== null) {
            clearTimeout(contentUpdateTimer);
            contentUpdateTimer = null;
        }
        if (scrollUpdateTimer !== null) {
            clearTimeout(scrollUpdateTimer);
            scrollUpdateTimer = null;
        }
        if (metricsUpdateTimer !== null) {
            clearTimeout(metricsUpdateTimer);
            metricsUpdateTimer = null;
        }
    }

    $effect(() => {
        if (tabId !== previousTabId) {
            clearAllTimers(); // Clear all pending updates
            const currentTab = editorStore.tabs.find((t) => t.id === tabId);
            if (currentTab && view) {
                untrack(() => {
                    const currentDoc = view.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        view.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
                    }
                    // Restore scroll position
                    setTimeout(() => {
                        if (view.scrollDOM && currentTab.scrollPercentage > 0) {
                            const scrollHeight = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
                            view.scrollDOM.scrollTop = scrollHeight * currentTab.scrollPercentage;
                        }
                    }, 0);
                });
            }
            previousTabId = tabId;
        }
    });

    onMount(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        const initialContent = currentTab?.content || "";
        const filename = currentTab?.title || "";
        previousTabId = tabId;

        const ext = filename.split(".").pop()?.toLowerCase();
        const isMarkdown = !ext || ["md", "markdown", "txt", "rst"].includes(ext) || filename.startsWith("Untitled");

        // Custom keymap to detect Insert Key and force End/Home behaviors
        const customKeymap = [
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
                    // Force DOM scroll as fallback for large docs
                    setTimeout(() => {
                        view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
                    }, 10);
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

        // Basic Overwrite Behavior Extension
        const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
            if (editorStore.activeMetrics.insertMode === "OVR" && from === to && text.length === 1) {
                const doc = view.state.doc;
                const line = doc.lineAt(from);
                if (from < line.to) {
                    view.dispatch({
                        changes: { from, to: from + 1, insert: text },
                        selection: { anchor: from + 1 },
                        userEvent: "input.type",
                    });
                    return true;
                }
            }
            return false;
        });

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            keymap.of([...customKeymap, ...defaultKeymap, ...historyKeymap]),
            oneDark,
            EditorView.lineWrapping,
            inputHandler,
            EditorView.theme({
                "&": { height: "100%", fontSize: "14px" },
                ".cm-cursor": {
                    borderLeftColor: editorStore.activeMetrics.insertMode === "OVR" ? "transparent" : "white",
                    borderBottom: editorStore.activeMetrics.insertMode === "OVR" ? "2px solid white" : "none",
                },
                ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
            }),
        ];

        if (isMarkdown) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            // Content updates - 100ms debounce
            if (update.docChanged) {
                if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
                contentUpdateTimer = window.setTimeout(() => {
                    editorStore.updateContent(tabId, update.state.doc.toString());
                    contentUpdateTimer = null;
                }, 100);
            }

            // Scroll updates - Low latency (10ms) for sync
            if (update.view.scrollDOM) {
                if (scrollUpdateTimer !== null) clearTimeout(scrollUpdateTimer);
                scrollUpdateTimer = window.setTimeout(() => {
                    const scrollElement = update.view.scrollDOM;
                    const scrollHeight = scrollElement.scrollHeight - scrollElement.clientHeight;
                    if (scrollHeight > 0) {
                        const percentage = scrollElement.scrollTop / scrollHeight;
                        if (!isNaN(percentage) && isFinite(percentage)) {
                            editorStore.updateScroll(tabId, Math.max(0, Math.min(1, percentage)));
                        }
                    }
                    scrollUpdateTimer = null;
                }, 10);
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
                    const cursorOffset = selection.head;

                    editorStore.updateMetrics({
                        lineCount: doc.lines,
                        wordCount: wordCount,
                        charCount: text.length,
                        cursorOffset: cursorOffset,
                        sizeKB: sizeKB,
                        cursorLine: cursorLine.number,
                        cursorCol: selection.head - cursorLine.from + 1,
                    });
                    metricsUpdateTimer = null;
                }, 200);
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

        view.focus();

        // Initial scroll restore
        if (currentTab && currentTab.scrollPercentage > 0) {
            setTimeout(() => {
                const dom = view.scrollDOM;
                const scrollHeight = dom.scrollHeight - dom.clientHeight;
                dom.scrollTop = scrollHeight * currentTab.scrollPercentage;
            }, 50);
        }
    });

    onDestroy(() => {
        clearAllTimers();
        if (view) view.destroy();
    });
</script>

<!-- Add a dynamic class based on insert mode for CSS styling of cursor -->
<div class="w-full h-full overflow-hidden bg-[#1e1e1e] {editorStore.activeMetrics.insertMode === 'OVR' ? 'overwrite-mode' : ''}" bind:this={editorContainer}></div>

<style>
    /* CSS override for cursor style when in overwrite mode */
    :global(.overwrite-mode .cm-cursor) {
        border-left: none !important;
        border-bottom: 3px solid #eac55f !important;
        width: 8px;
    }
</style>
