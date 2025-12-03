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
                    event.preventDefault(); // Prevent default system behavior if any
                    editorStore.toggleInsertMode();
                }
            },
        });

        // Basic Overwrite Behavior Extension
        const overwriteModeExtension = EditorState.transactionFilter.of((tr) => {
            if (editorStore.activeMetrics.insertMode === "OVR" && tr.isUserEvent("input.type") && !tr.selection) {
                // If user is typing a character (insert) and has no selection range
                // We want to replace the character at the cursor instead of inserting
                let changes: any[] = [];
                tr.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
                    if (inserted.length > 0) {
                        // Check if we are at end of line; if so, standard insert. Otherwise replace next char.
                        const doc = tr.startState.doc;
                        const line = doc.lineAt(fromA);
                        if (fromA < line.to) {
                            // Replace next char
                            changes.push({ from: fromA, to: fromA + inserted.length, insert: inserted });
                        } else {
                            // End of line, standard append
                            changes.push({ from: fromA, to: fromA, insert: inserted });
                        }
                    }
                });

                if (changes.length > 0) {
                    return [
                        tr, // The original transaction (typing) - we modify it or replace it?
                        // Actually better to completely replace the changes
                        {
                            changes: changes,
                            selection: { anchor: changes[0].to },
                            filter: false,
                        },
                    ];
                }
            }
            return tr;
        });

        // Simpler approach for OVR: View Update Listener checks for input and modifies it?
        // Transaction filters are cleaner but tricky.
        // Let's use a standard input handler for overwrite.

        const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
            if (editorStore.activeMetrics.insertMode === "OVR" && from === to && text.length === 1) {
                const doc = view.state.doc;
                const line = doc.lineAt(from);

                // If not at end of line, replace character
                if (from < line.to) {
                    view.dispatch({
                        changes: { from, to: from + 1, insert: text },
                        selection: { anchor: from + 1 },
                        userEvent: "input.type",
                    });
                    return true; // Handled
                }
            }
            return false; // Let default handler run
        });

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            oneDark,
            EditorView.lineWrapping,
            insertKeyHandler,
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

            if (update.docChanged || update.selectionSet) {
                const doc = update.state.doc;
                const selection = update.state.selection.main;
                const cursorLine = doc.lineAt(selection.head);
                const text = doc.toString();
                const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
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

    // Reactive update for Cursor Style when Insert Mode changes
    $effect(() => {
        // Accessing the store value triggers re-run
        const mode = editorStore.activeMetrics.insertMode;
        if (view) {
            // We need to reconfigure the theme to change cursor style
            // This is a bit heavy, strictly speaking, but effective.
            // Alternatively we can toggle a class on the editorContainer
        }
    });

    onDestroy(() => {
        if (view) view.destroy();
        clearTimeout(timer);
    });
</script>

<!-- Add a dynamic class based on insert mode for CSS styling of cursor -->
<div class="w-full h-full overflow-hidden bg-[#1e1e1e] {editorStore.activeMetrics.insertMode === 'OVR' ? 'overwrite-mode' : ''}" bind:this={editorContainer}></div>

<style>
    /* CSS override for cursor style when in overwrite mode */
    :global(.overwrite-mode .cm-cursor) {
        border-left: none !important;
        border-bottom: 3px solid #eac55f !important; /* Block cursor look */
        width: 8px;
    }
</style>
