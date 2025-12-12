<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { transformText } from "$lib/utils/textTransforms";
    import { formatMarkdown } from "$lib/utils/formatter";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { search, highlightSelectionMatches } from "@codemirror/search";
    import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;
    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;
    let previousTabId: string = "";
    let themeCompartment = new Compartment();
    
    // Context menu state
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    
    // Function to trigger spellcheck refresh
    function refreshSpellcheck() {
        if (!view) return;
        // Force DOM to re-render spellcheck by toggling and restoring spellcheck attribute
        const container = view.dom;
        container.spellcheck = false;
        setTimeout(() => {
            container.spellcheck = true;
        }, 0);
    }

    function clearAllTimers() {
        if (contentUpdateTimer !== null) {
            clearTimeout(contentUpdateTimer);
            contentUpdateTimer = null;
        }
        if (metricsUpdateTimer !== null) {
            clearTimeout(metricsUpdateTimer);
            metricsUpdateTimer = null;
        }
    }
    
    function handleTextOperation(operation: TextOperation) {
        if (!view) return;
        
        const state = view.state;
        const doc = state.doc;
        const text = doc.toString();
        
        let newText: string;
        
        // Handle format-document specially
        if (operation.type === 'format-document') {
            newText = formatMarkdown(text, {
                listIndent: appState.formatterListIndent || 2,
                bulletChar: appState.formatterBulletChar || '-',
                codeBlockFence: appState.formatterCodeFence || '```',
                tableAlignment: appState.formatterTableAlignment !== false
            });
        } else {
            // Use the centralized transformation utility
            newText = transformText(text, operation.type);
        }
        
        // Use a transaction to support undo/redo
        view.dispatch({
            changes: { from: 0, to: doc.length, insert: newText },
            userEvent: 'input.complete'
        });
    }

    $effect(() => {
        if (view) {
            const newTheme = EditorView.theme({
                "&": { height: "100%", fontSize: `${appState.editorFontSize}px` },
                ".cm-cursor": {
                    borderLeftColor: editorStore.activeMetrics.insertMode === "OVR" ? "transparent" : "white",
                    borderBottom: editorStore.activeMetrics.insertMode === "OVR" ? "2px solid white" : "none",
                },
                ".cm-scroller": { fontFamily: appState.editorFontFamily, overflow: "auto" },
            });
            view.dispatch({
                effects: themeCompartment.reconfigure(newTheme),
            });
        }
    });

    $effect(() => {
        if (tabId !== previousTabId) {
            clearAllTimers();
            const currentTab = editorStore.tabs.find((t) => t.id === tabId);
            if (currentTab && view) {
                untrack(() => {
                    const currentDoc = view.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        view.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
                    }
                    setTimeout(() => {
                        if (view.scrollDOM && currentTab.scrollPercentage >= 0) {
                            const dom = view.scrollDOM;
                            const scrollHeight = dom.scrollHeight - dom.clientHeight;
                            if (scrollHeight > 0) {
                                dom.scrollTop = scrollHeight * currentTab.scrollPercentage;
                            }
                        }
                    }, 0);
                });
            }
            previousTabId = tabId;
        }
    });

    onMount(() => {
        // Register text operation callback
        editorStore.registerTextOperationCallback(handleTextOperation);
        
        const currentTab = editorStore.tabs.find((t) => t.id === tabId);
        const initialContent = currentTab?.content || "";
        const filename = currentTab?.title || "";

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
            {
                key: "F8",
                run: (view: EditorView) => {
                    const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
                    if (selection && selection.trim().length > 0) {
                        // Extract words from selection
                        const words = selection
                            .split(/\s+/)
                            .map(w => w.replace(/[^a-zA-Z0-9'-]/g, ''))
                            .filter(w => w.length > 0)
                            .filter((word, index, self) => self.indexOf(word) === index);
                        
                        // Add all words
                        Promise.all(words.map(w => addToDictionary(w))).then(() => {
                            refreshSpellcheck();
                        });
                    } else {
                        // Try to get word under cursor
                        const range = view.state.wordAt(view.state.selection.main.head);
                        if (range) {
                            const word = view.state.sliceDoc(range.from, range.to);
                            addToDictionary(word).then(() => {
                                refreshSpellcheck();
                            });
                        }
                    }
                    return true;
                },
            },
        ];

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

        const eventHandlers = EditorView.domEventHandlers({
            contextmenu: (event, view) => {
                event.preventDefault();
                const selection = view.state.selection.main;
                const selectedText = view.state.sliceDoc(selection.from, selection.to);
                
                let wordUnderCursor = "";
                if (!selectedText) {
                    const range = view.state.wordAt(selection.head);
                    if (range) {
                        wordUnderCursor = view.state.sliceDoc(range.from, range.to);
                    }
                }
                
                contextSelectedText = selectedText;
                contextWordUnderCursor = wordUnderCursor;
                contextMenuX = event.clientX;
                contextMenuY = event.clientY;
                showContextMenu = true;
                
                return true;
            },
            scroll: (event, view) => {
                const dom = view.scrollDOM;
                const maxScroll = dom.scrollHeight - dom.clientHeight;

                if (maxScroll > 0) {
                    let percentage = dom.scrollTop / maxScroll;

                    if (dom.scrollTop <= 2) percentage = 0;
                    else if (Math.abs(dom.scrollTop - maxScroll) <= 2) percentage = 1;

                    percentage = Math.max(0, Math.min(1, percentage));
                    editorStore.updateScroll(tabId, percentage);
                } else {
                    editorStore.updateScroll(tabId, 0);
                }
            },
        });

        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            search({
                top: true,
            }),
            highlightSelectionMatches(),
            keymap.of([...customKeymap, ...defaultKeymap, ...historyKeymap]),
            oneDark,
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ spellcheck: "true" }),
            inputHandler,
            eventHandlers,
            themeCompartment.of(
                EditorView.theme({
                    "&": { height: "100%", fontSize: `${appState.editorFontSize}px` },
                    ".cm-cursor": {
                        borderLeftColor: editorStore.activeMetrics.insertMode === "OVR" ? "transparent" : "white",
                        borderBottom: editorStore.activeMetrics.insertMode === "OVR" ? "2px solid white" : "none",
                    },
                    ".cm-scroller": { fontFamily: appState.editorFontFamily, overflow: "auto" },
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
                })
            ),
        ];

        if (!filename.endsWith(".txt")) {
            extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
        }

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                if (contentUpdateTimer !== null) clearTimeout(contentUpdateTimer);
                contentUpdateTimer = window.setTimeout(() => {
                    editorStore.updateContent(tabId, update.state.doc.toString());
                    contentUpdateTimer = null;
                }, 100);
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

        const handleWindowFocus = () => {
            if (view && !view.hasFocus) {
                view.focus();
            }
        };
        window.addEventListener("focus", handleWindowFocus);

        view.focus();

        return () => {
            window.removeEventListener("focus", handleWindowFocus);
            if (view) view.destroy();
            clearAllTimers();
            editorStore.unregisterTextOperationCallback();
        };
    });

    onDestroy(() => {
        clearAllTimers();
        if (view) {
            view.destroy();
            view = null as any; // Ensure garbage collection
        }
        editorStore.unregisterTextOperationCallback();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div role="none" class="w-full h-full overflow-hidden bg-[#1e1e1e] {editorStore.activeMetrics.insertMode === 'OVR' ? 'overwrite-mode' : ''}" bind:this={editorContainer} onclick={() => view?.focus()}></div>

{#if showContextMenu}
    <EditorContextMenu 
        x={contextMenuX} 
        y={contextMenuY} 
        selectedText={contextSelectedText}
        wordUnderCursor={contextWordUnderCursor}
        onClose={() => showContextMenu = false}
        onDictionaryUpdate={refreshSpellcheck}
    />
{/if}

<style>
    :global(.overwrite-mode .cm-cursor) {
        border-left: none !important;
        border-bottom: 3px solid #eac55f !important;
        width: 8px;
    }
</style>
