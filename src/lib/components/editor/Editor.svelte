<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { addToDictionary } from "$lib/utils/fileSystem";
    import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { languages } from "@codemirror/language-data";
    import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
    import { message } from "@tauri-apps/plugin-dialog";
    import { onDestroy, onMount, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorContainer: HTMLDivElement;
    let view: EditorView;
    let contentUpdateTimer: number | null = null;
    let metricsUpdateTimer: number | null = null;
    let previousTabId: string = "";
    let themeCompartment = new Compartment();

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
                        addToDictionary(selection.trim()).then(() => message(`Added "${selection}" to dictionary.`, { kind: "info" }));
                    } else {
                        // Try to get word under cursor
                        const range = view.state.wordAt(view.state.selection.main.head);
                        if (range) {
                            const word = view.state.sliceDoc(range.from, range.to);
                            addToDictionary(word).then(() => message(`Added "${word}" to dictionary.`, { kind: "info" }));
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
        };
    });

    onDestroy(() => {
        clearAllTimers();
        if (view) view.destroy();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div role="none" class="w-full h-full overflow-hidden bg-[#1e1e1e] {editorStore.activeMetrics.insertMode === 'OVR' ? 'overwrite-mode' : ''}" bind:this={editorContainer} onclick={() => view?.focus()}></div>

<style>
    :global(.overwrite-mode .cm-cursor) {
        border-left: none !important;
        border-bottom: 3px solid #eac55f !important;
        width: 8px;
    }
</style>
