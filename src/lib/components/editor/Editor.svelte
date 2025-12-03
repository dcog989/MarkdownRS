<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;
    let timer: number;
    let previousTabId: string = "";

    // 1. Safe Reactivity: Only update Editor content if the TAB ID changes.
    // If we update on content change, we fight the debounce and revert user typing.
    $effect(() => {
        if (tabId !== previousTabId) {
            const currentTab = editorStore.tabs.find((t) => t.id === tabId);
            if (currentTab && view) {
                untrack(() => {
                    const currentDoc = view.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        view.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
                        // Reset scroll
                        // view.scrollDOM.scrollTop = ... (omitted for simplicity, relies on derived)
                    }
                });
            }
            previousTabId = tabId;
        }
    });

    onMount(() => {
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        const initialContent = currentTab?.content || "";
        previousTabId = tabId;

        const updateListener = EditorView.updateListener.of((update) => {
            // 1. Handle Content Updates (Debounced)
            if (update.docChanged) {
                clearTimeout(timer);
                timer = window.setTimeout(() => {
                    editorStore.updateContent(tabId, update.state.doc.toString());
                }, 100);
            }

            // 2. Handle Scroll (Debounced)
            if (update.view.scrollDOM) {
                const scrollElement = update.view.scrollDOM;
                const percentage = scrollElement.scrollTop / (scrollElement.scrollHeight - scrollElement.clientHeight);
                if (!isNaN(percentage)) {
                    // We can reuse the same timer or a separate one, but scroll needs to be snappy for preview sync
                    // Ideally we update store scroll immediately or with very low debounce
                    editorStore.updateScroll(tabId, percentage);
                }
            }

            // 3. Handle Metrics (Immediate for UI responsiveness)
            if (update.docChanged || update.selectionSet) {
                const doc = update.state.doc;
                const selection = update.state.selection.main;
                const cursorLine = doc.lineAt(selection.head);

                const text = doc.toString();
                const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
                const sizeKB = new TextEncoder().encode(text).length / 1024;

                editorStore.updateMetrics({
                    lineCount: doc.lines,
                    wordCount: wordCount,
                    charCount: text.length,
                    sizeKB: sizeKB,
                    cursorLine: cursorLine.number,
                    cursorCol: selection.head - cursorLine.from + 1,
                    insertMode: "INS", // CodeMirror is always insert mode unless using Vim plugin
                });
            }
        });

        const state = EditorState.create({
            doc: initialContent,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                oneDark,
                EditorView.lineWrapping,
                updateListener,
                EditorView.theme({
                    "&": { height: "100%", fontSize: "14px" },
                    ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
                }),
            ],
        });

        view = new EditorView({
            state,
            parent: editorContainer,
        });
    });

    onDestroy(() => {
        if (view) view.destroy();
        clearTimeout(timer);
    });
</script>

<div class="w-full h-full overflow-hidden" bind:this={editorContainer}></div>
