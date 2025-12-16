<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatter";
    import { initSpellcheck } from "$lib/utils/spellcheck";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension";
    import { transformText } from "$lib/utils/textTransforms";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onDestroy, onMount, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let scrollDOM = $state<HTMLElement | null>(null);
    let previousTabId: string = "";
    let isRemoteScrolling = false;
    let scrollDebounce: number | null = null;

    // Context menu state
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");

    // Find/Replace panel state
    let showFindReplace = $state(false);

    // Initialize extensions
    const spellCheckLinter = createSpellCheckLinter();

    function handleDictionaryUpdate() {
        refreshSpellcheck(editorViewComponent?.getView());
    }

    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            const view = editorViewComponent?.getView();
            if (view && text) {
                let textToInsert = text;

                if (appState.formatOnPaste) {
                    try {
                        textToInsert = formatMarkdown(text, {
                            listIndent: appState.formatterListIndent || 2,
                            bulletChar: appState.formatterBulletChar || "-",
                            codeBlockFence: appState.formatterCodeFence || "```",
                            tableAlignment: appState.formatterTableAlignment !== false,
                        });
                    } catch (err) {
                        console.warn("Format on paste failed, using original text:", err);
                    }
                }

                const selection = view.state.selection.main;
                view.dispatch({
                    changes: { from: selection.from, to: selection.to, insert: textToInsert },
                    selection: { anchor: selection.from + textToInsert.length },
                    userEvent: "input.paste",
                    scrollIntoView: true,
                });
                view.focus();
            }
        } catch (err) {
            console.error("Paste failed:", err);
        }
    }

    function handleTextOperation(operation: TextOperation) {
        const view = editorViewComponent?.getView();
        if (!view) return;

        const state = view.state;
        const doc = state.doc;
        const selection = state.selection.main;

        const hasSelection = selection.from !== selection.to;

        let newText: string;
        let from: number;
        let to: number;

        if (operation.type === "format-document") {
            if (hasSelection) {
                const selectedText = state.sliceDoc(selection.from, selection.to);
                newText = formatMarkdown(selectedText, {
                    listIndent: appState.formatterListIndent || 2,
                    bulletChar: appState.formatterBulletChar || "-",
                    codeBlockFence: appState.formatterCodeFence || "```",
                    tableAlignment: appState.formatterTableAlignment !== false,
                });
                from = selection.from;
                to = selection.to;
            } else {
                const text = doc.toString();
                newText = formatMarkdown(text, {
                    listIndent: appState.formatterListIndent || 2,
                    bulletChar: appState.formatterBulletChar || "-",
                    codeBlockFence: appState.formatterCodeFence || "```",
                    tableAlignment: appState.formatterTableAlignment !== false,
                });
                from = 0;
                to = doc.length;
            }
        } else {
            if (hasSelection) {
                const selectedText = state.sliceDoc(selection.from, selection.to);
                newText = transformText(selectedText, operation.type);
                from = selection.from;
                to = selection.to;
            } else {
                const text = doc.toString();
                newText = transformText(text, operation.type);
                from = 0;
                to = doc.length;
            }
        }

        view.dispatch({
            changes: { from, to, insert: newText },
            selection: { anchor: from + newText.length },
            userEvent: "input.complete",
        });
    }

    const inputHandler = CM6EditorView.inputHandler.of((view, from, to, text) => {
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

    const eventHandlers = CM6EditorView.domEventHandlers({
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
            if (isRemoteScrolling) return;
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

    // Custom keymap for Ctrl+F
    const findReplaceKeymap = [
        {
            key: "Mod-f",
            run: () => {
                showFindReplace = !showFindReplace;
                return true;
            },
        },
        {
            key: "Mod-h",
            run: () => {
                showFindReplace = true;
                return true;
            },
        },
    ];

    $effect(() => {
        if (tabId !== previousTabId) {
            const view = editorViewComponent?.getView();
            const currentTab = editorStore.tabs.find((t) => t.id === tabId);
            if (currentTab && view) {
                untrack(() => {
                    const currentDoc = view.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        view.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
                    }

                    const doc = view.state.doc;
                    const selection = view.state.selection.main;
                    const cursorLine = doc.lineAt(selection.head);
                    const text = doc.toString();
                    const trimmedText = text.trim();
                    const wordCount = trimmedText === "" ? 0 : trimmedText.split(/\s+/).length;
                    const sizeKB = new TextEncoder().encode(text).length / 1024;

                    editorStore.updateMetrics({
                        lineCount: doc.lines,
                        wordCount: wordCount,
                        charCount: text.length,
                        cursorOffset: selection.head,
                        sizeKB: sizeKB,
                        cursorLine: cursorLine.number,
                        cursorCol: selection.head - cursorLine.from + 1,
                    });

                    setTimeout(() => {
                        if (view.scrollDOM && currentTab.scrollPercentage >= 0) {
                            const dom = view.scrollDOM;
                            const scrollHeight = dom.scrollHeight - dom.clientHeight;
                            if (scrollHeight > 0) {
                                isRemoteScrolling = true;
                                dom.scrollTop = scrollHeight * currentTab.scrollPercentage;
                                setTimeout(() => (isRemoteScrolling = false), 50);
                            }
                        }
                    }, 0);

                    checkFileExists(tabId);
                });
            }
            previousTabId = tabId;
        }
    });

    let currentTabState = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let targetScrollPercentage = $derived(currentTabState?.scrollPercentage ?? 0);

    $effect(() => {
        const target = targetScrollPercentage;
        const view = editorViewComponent?.getView();
        if (!view || !view.scrollDOM || previousTabId === tabId) return;

        const dom = view.scrollDOM;
        const maxScroll = dom.scrollHeight - dom.clientHeight;
        if (maxScroll <= 0) return;

        const currentScroll = dom.scrollTop;
        const targetScroll = maxScroll * target;

        if (Math.abs(currentScroll - targetScroll) > maxScroll * 0.01) {
            isRemoteScrolling = true;
            dom.scrollTop = targetScroll;
            if (scrollDebounce) clearTimeout(scrollDebounce);
            scrollDebounce = window.setTimeout(() => {
                isRemoteScrolling = false;
            }, 50);
        }
    });

    onMount(() => {
        initSpellcheck();
        editorStore.registerTextOperationCallback(handleTextOperation);

        return () => {
            editorStore.unregisterTextOperationCallback();
            if (scrollDebounce) clearTimeout(scrollDebounce);
        };
    });

    onDestroy(() => {
        editorStore.unregisterTextOperationCallback();
        if (scrollDebounce) clearTimeout(scrollDebounce);
    });

    $effect(() => {
        scrollDOM = editorViewComponent?.getScrollDOM() || null;
    });

    let currentTab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let initialContent = $derived(currentTab?.content || "");
    let filename = $derived(currentTab?.title || "");

    // Combine all keymaps
    let combinedKeymap = $derived([...findReplaceKeymap, ...spellCheckKeymap]);
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView bind:this={editorViewComponent} {tabId} {initialContent} {filename} customKeymap={combinedKeymap} {spellCheckLinter} {inputHandler} {eventHandlers} onContentChange={(content) => editorStore.updateContent(tabId, content)} onMetricsChange={(metrics) => editorStore.updateMetrics(metrics)} />

    {#if scrollDOM}
        <CustomScrollbar viewport={scrollDOM} />
    {/if}

    <FindReplacePanel bind:isOpen={showFindReplace} editorView={editorViewComponent} />
</div>

{#if showContextMenu}
    <EditorContextMenu x={contextMenuX} y={contextMenuY} selectedText={contextSelectedText} wordUnderCursor={contextWordUnderCursor} onClose={() => (showContextMenu = false)} onDictionaryUpdate={handleDictionaryUpdate} onPaste={handlePaste} />
{/if}
