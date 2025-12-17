<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists } from "$lib/utils/fileSystem";
    import { cleanupScrollSync, createScrollSyncState, getScrollPercentage, setScrollPercentage } from "$lib/utils/scrollSync";
    import { formatMarkdown } from "$lib/utils/formatter";
    import { initSpellcheck } from "$lib/utils/spellcheck";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension";
    import { transformText } from "$lib/utils/textTransforms";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onDestroy, onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let findReplacePanel = $state<any>(null);
    let scrollDOM = $state<HTMLElement | null>(null);
    let previousTabId: string = "";
    
    // Scroll sync state using shared utilities
    const scrollSyncState = createScrollSyncState();
    let scrollSyncFrame: number | null = null;

    // Context menu state
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    // Track location for spelling replacements
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

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

    function handleReplaceWord(newWord: string) {
        const view = editorViewComponent?.getView();
        if (view && contextWordFrom !== contextWordTo) {
            view.dispatch({
                changes: { from: contextWordFrom, to: contextWordTo, insert: newWord },
                userEvent: "input.spellcheck",
            });
            // Force refresh to remove the red underline
            refreshSpellcheck(view);
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
            let from = 0;
            let to = 0;

            if (!selectedText) {
                // Get word at cursor position
                let range = view.state.wordAt(selection.head);
                if (range) {
                    from = range.from;
                    to = range.to;
                    wordUnderCursor = view.state.sliceDoc(from, to);
                    
                    // Check if we clicked on just the possessive part ('s or ')
                    // If so, expand to include the base word
                    if (wordUnderCursor === "'s" || wordUnderCursor === "'") {
                        // Look backwards for the actual word
                        const prevRange = view.state.wordAt(from - 1);
                        if (prevRange && prevRange.to === from) {
                            // Found the base word right before the apostrophe
                            from = prevRange.from;
                            wordUnderCursor = view.state.sliceDoc(from, to);
                        }
                    }
                }
            }

            contextSelectedText = selectedText;
            contextWordUnderCursor = wordUnderCursor;
            contextWordFrom = from;
            contextWordTo = to;
            contextMenuX = event.clientX;
            contextMenuY = event.clientY;
            showContextMenu = true;
            return true;
        },
        scroll: (event, view) => {
            // Don't update scroll if we're currently being remotely scrolled
            if (scrollSyncState.isRemoteScrolling) return;
            
            const dom = view.scrollDOM;
            const percentage = getScrollPercentage(dom);
            editorStore.updateScroll(tabId, percentage);
        },
    });

    async function handleGlobalFind() {
        if (appState.activeTabId !== tabId) return;
        showFindReplace = true;
        await tick();
        findReplacePanel?.setReplaceMode(false);
        findReplacePanel?.focusInput();
    }

    async function handleGlobalReplace() {
        if (appState.activeTabId !== tabId) return;
        showFindReplace = true;
        await tick();
        findReplacePanel?.setReplaceMode(true);
        findReplacePanel?.focusInput();
    }

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
                            const maxScroll = dom.scrollHeight - dom.clientHeight;
                            if (maxScroll > 0) {
                                scrollSyncState.isRemoteScrolling = true;
                                dom.scrollTop = maxScroll * currentTab.scrollPercentage;
                                if (scrollSyncState.lockTimeout) clearTimeout(scrollSyncState.lockTimeout);
                                scrollSyncState.lockTimeout = window.setTimeout(() => {
                                    scrollSyncState.isRemoteScrolling = false;
                                }, 50);
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

    // Incoming scroll sync from Preview -> Editor
    $effect(() => {
        const target = targetScrollPercentage;
        const view = editorViewComponent?.getView();
        
        // Don't sync on tab switch (that's handled above)
        if (!view || !view.scrollDOM || previousTabId !== tabId) return;

        const dom = view.scrollDOM;

        if (scrollSyncFrame !== null) {
            cancelAnimationFrame(scrollSyncFrame);
        }

        scrollSyncFrame = requestAnimationFrame(() => {
            if (!view || !view.scrollDOM) return;
            setScrollPercentage(dom, target, scrollSyncState);
            scrollSyncFrame = null;
        }) as number;

        return () => {
            if (scrollSyncFrame !== null) {
                cancelAnimationFrame(scrollSyncFrame);
                scrollSyncFrame = null;
            }
        };
    });

    onMount(() => {
        initSpellcheck();
        editorStore.registerTextOperationCallback(handleTextOperation);

        // Listen for global Find/Replace events
        window.addEventListener("open-find", handleGlobalFind);
        window.addEventListener("open-replace", handleGlobalReplace);

        return () => {
            editorStore.unregisterTextOperationCallback();
            window.removeEventListener("open-find", handleGlobalFind);
            window.removeEventListener("open-replace", handleGlobalReplace);
            cleanupScrollSync(scrollSyncState);
            if (scrollSyncFrame !== null) {
                cancelAnimationFrame(scrollSyncFrame);
            }
        };
    });

    onDestroy(() => {
        editorStore.unregisterTextOperationCallback();
        window.removeEventListener("open-find", handleGlobalFind);
        window.removeEventListener("open-replace", handleGlobalReplace);
        cleanupScrollSync(scrollSyncState);
        if (scrollSyncFrame !== null) {
            cancelAnimationFrame(scrollSyncFrame);
        }
    });

    $effect(() => {
        scrollDOM = editorViewComponent?.getScrollDOM() || null;
    });

    let currentTab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let initialContent = $derived(currentTab?.content || "");
    let filename = $derived(currentTab?.title || "");

    // Combined keymap - removed Mod-f/Mod-h as they are handled globally
    let combinedKeymap = $derived([...spellCheckKeymap]);
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView bind:this={editorViewComponent} {tabId} {initialContent} {filename} customKeymap={combinedKeymap} {spellCheckLinter} {inputHandler} {eventHandlers} onContentChange={(content) => editorStore.updateContent(tabId, content)} onMetricsChange={(metrics) => editorStore.updateMetrics(metrics)} />

    {#if scrollDOM}
        <CustomScrollbar viewport={scrollDOM} />
    {/if}

    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} editorView={editorViewComponent} />
</div>

{#if showContextMenu}
    <EditorContextMenu x={contextMenuX} y={contextMenuY} selectedText={contextSelectedText} wordUnderCursor={contextWordUnderCursor} onClose={() => (showContextMenu = false)} onDictionaryUpdate={handleDictionaryUpdate} onPaste={handlePaste} onReplaceWord={handleReplaceWord} />
{/if}
