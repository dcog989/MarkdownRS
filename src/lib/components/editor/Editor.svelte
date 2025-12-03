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

    // 1. Safe Reactivity for Tab Switching
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
                    }
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

        // Custom keymap to detect Insert Key
        const insertKeyHandler = EditorView.domEventHandlers({
            keydown: (event, _view) => {
                if (event.key === "Insert") {
                    editorStore.toggleInsertMode();
                }
            },
        });

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            oneDark,
            EditorView.lineWrapping,
            insertKeyHandler, // Attach handler
            EditorView.theme({
                "&": { height: "100%", fontSize: "14px" },
                ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
            }),
        ];

        if (isMarkdown) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                clearTimeout(timer);
                timer = window.setTimeout(() => {
                    editorStore.updateContent(tabId, update.state.doc.toString());
                }, 100);
            }

            if (update.view.scrollDOM) {
                const scrollElement = update.view.scrollDOM;
                const percentage = scrollElement.scrollTop / (scrollElement.scrollHeight - scrollElement.clientHeight);
                if (!isNaN(percentage)) {
                    editorStore.updateScroll(tabId, percentage);
                }
            }

            // Metrics calculation
            if (update.docChanged || update.selectionSet) {
                const doc = update.state.doc;
                const selection = update.state.selection.main;
                const cursorLine = doc.lineAt(selection.head);
                const text = doc.toString();
                const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
                const sizeKB = new TextEncoder().encode(text).length / 1024;

                // selection.head is the absolute offset in the document (0-based index)
                const cursorOffset = selection.head;

                editorStore.updateMetrics({
                    lineCount: doc.lines,
                    wordCount: wordCount,
                    charCount: text.length,
                    cursorOffset: cursorOffset, // x
                    sizeKB: sizeKB,
                    cursorLine: cursorLine.number,
                    cursorCol: selection.head - cursorLine.from + 1,
                    // Note: insertMode is toggled via store action separately
                });
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
    });

    onDestroy(() => {
        if (view) view.destroy();
        clearTimeout(timer);
    });
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e]" bind:this={editorContainer}></div>
