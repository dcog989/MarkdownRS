<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists, navigateToPath } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatterRust";
    import { cleanupScrollSync, createScrollSyncState, getScrollPercentage } from "$lib/utils/scrollSync";
    import { initSpellcheck, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension";
    import { transformText } from "$lib/utils/textTransformsRust";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onDestroy, onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let findReplacePanel = $state<any>(null);
    let scrollDOM = $state<HTMLElement | null>(null);
    let previousTabId: string = "";

    const scrollSyncState = createScrollSyncState();
    let scrollSyncFrame: number | null = null;

    let isHovered = false;
    let isFocused = false;

    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let showFindReplace = $state(false);

    const spellCheckLinter = createSpellCheckLinter();

    let currentTabState = $derived(editorStore.tabs.find((t) => t.id === tabId));

    function handleDictionaryUpdate() {
        refreshSpellcheck(editorViewComponent?.getView());
    }

    async function handleCopy() {
        if (contextSelectedText) {
            await navigator.clipboard.writeText(contextSelectedText);
        }
    }

    async function handleCut() {
        const view = editorViewComponent?.getView();
        if (view && contextSelectedText) {
            await navigator.clipboard.writeText(contextSelectedText);
            const selection = view.state.selection.main;
            view.dispatch({
                changes: { from: selection.from, to: selection.to, insert: "" },
                userEvent: "delete.cut",
            });
            view.focus();
        }
    }

    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            const view = editorViewComponent?.getView();
            if (view && text) {
                let textToInsert = text;
                if (appState.formatOnPaste) {
                    try {
                        textToInsert = await formatMarkdown(text, {
                            listIndent: appState.formatterListIndent || 2,
                            bulletChar: appState.formatterBulletChar || "-",
                            codeBlockFence: appState.formatterCodeFence || "```",
                            tableAlignment: appState.formatterTableAlignment !== false,
                        });
                    } catch (err) {
                        console.warn("Format on paste failed:", err);
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
            refreshSpellcheck(view);
        }
    }

    async function handleTextOperation(operation: TextOperation) {
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
                newText = await formatMarkdown(selectedText, {
                    listIndent: appState.formatterListIndent || 2,
                    bulletChar: appState.formatterBulletChar || "-",
                    codeBlockFence: appState.formatterCodeFence || "```",
                    tableAlignment: appState.formatterTableAlignment !== false,
                });
                from = selection.from;
                to = selection.to;
            } else {
                const text = doc.toString();
                newText = await formatMarkdown(text, {
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
                newText = await transformText(selectedText, operation.type);
                from = selection.from;
                to = selection.to;
            } else {
                const text = doc.toString();
                newText = await transformText(text, operation.type);
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
        if (editorStore.insertMode === "OVR" && from === to && text.length === 1) {
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
        mousedown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos !== null) {
                    const line = view.state.doc.lineAt(pos);
                    const pathRegex = /(?:[a-zA-Z]:[\\\/]|[\\\/]|\.?\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}'~`+]+/g;

                    let match;
                    while ((match = pathRegex.exec(line.text)) !== null) {
                        const start = line.from + match.index;
                        const end = start + match[0].length;

                        if (pos >= start && pos <= end) {
                            navigateToPath(match[0]);
                            return true;
                        }
                    }
                }
            }
            return false;
        },
        contextmenu: (event, view) => {
            event.preventDefault();
            const selection = view.state.selection.main;
            const selectedText = view.state.sliceDoc(selection.from, selection.to);

            let wordUnderCursor = "";
            let from = 0;
            let to = 0;

            if (!selectedText) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                const searchPos = pos !== null ? pos : selection.head;
                const range = view.state.wordAt(searchPos);

                if (range) {
                    from = range.from;
                    to = range.to;
                    const rawWord = view.state.sliceDoc(from, to);
                    wordUnderCursor = rawWord.replace(/[^a-zA-Z']/g, "");
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
            if (!isHovered && !isFocused && !scrollSyncState.isRemoteScrolling) return;
            if (scrollSyncState.isRemoteScrolling) return;

            const dom = view.scrollDOM;
            const percentage = getScrollPercentage(dom);

            const lineBlock = view.lineBlockAtHeight(dom.scrollTop);
            const lineNum = view.state.doc.lineAt(lineBlock.from).number;

            const progress = (dom.scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
            const preciseLine = lineNum + Math.max(0, Math.min(1, progress));

            editorStore.updateScroll(tabId, percentage, preciseLine);
        },
        focus: () => {
            isFocused = true;
        },
        blur: () => {
            isFocused = false;
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

                    editorStore.updateMetrics({
                        lineCount: doc.lines,
                        wordCount: wordCount,
                        charCount: text.length,
                        cursorOffset: selection.head,
                        cursorLine: cursorLine.number,
                        cursorCol: selection.head - cursorLine.from + 1,
                        currentLineLength: cursorLine.text.length,
                        currentWordIndex: text.substring(0, selection.head).trim().split(/\s+/).length,
                    });

                    setTimeout(() => {
                        if (view.scrollDOM && currentTab.scrollPercentage >= 0) {
                            const dom = view.scrollDOM;
                            const originalBehavior = dom.style.scrollBehavior;

                            dom.style.scrollBehavior = "auto";

                            if (currentTab.topLine && currentTab.topLine > 1) {
                                try {
                                    const lineBlock = view.lineBlockAt(view.state.doc.line(Math.floor(currentTab.topLine)).from);
                                    scrollSyncState.isRemoteScrolling = true;
                                    dom.scrollTop = lineBlock.top;
                                } catch (e) {
                                    scrollSyncState.isRemoteScrolling = true;
                                    dom.scrollTop = (dom.scrollHeight - dom.clientHeight) * currentTab.scrollPercentage;
                                }
                            } else {
                                scrollSyncState.isRemoteScrolling = true;
                                dom.scrollTop = (dom.scrollHeight - dom.clientHeight) * currentTab.scrollPercentage;
                            }

                            requestAnimationFrame(() => {
                                dom.style.scrollBehavior = originalBehavior;
                                if (scrollSyncState.lockTimeout) clearTimeout(scrollSyncState.lockTimeout);
                                scrollSyncState.lockTimeout = window.setTimeout(() => {
                                    scrollSyncState.isRemoteScrolling = false;
                                }, 100);
                            });
                        }
                    }, 0);

                    checkFileExists(tabId);
                });
            }
            previousTabId = tabId;
        }
    });

    $effect(() => {
        if (!editorViewComponent) return;
        const view = editorViewComponent.getView();
        if (!view || !view.scrollDOM || previousTabId !== tabId) return;

        const targetLine = currentTabState?.topLine;

        if (isHovered || isFocused) return;

        if (targetLine !== undefined && targetLine > 0) {
            if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);

            scrollSyncFrame = requestAnimationFrame(() => {
                if (!view) return;

                try {
                    const lineInt = Math.floor(targetLine);
                    const lineBlock = view.lineBlockAt(view.state.doc.line(lineInt).from);
                    const dom = view.scrollDOM;

                    if (Math.abs(dom.scrollTop - lineBlock.top) > 5) {
                        scrollSyncState.isRemoteScrolling = true;
                        dom.scrollTop = lineBlock.top;

                        if (scrollSyncState.lockTimeout) clearTimeout(scrollSyncState.lockTimeout);
                        scrollSyncState.lockTimeout = window.setTimeout(() => {
                            scrollSyncState.isRemoteScrolling = false;
                        }, 100);
                    }
                } catch (e) {}
                scrollSyncFrame = null;
            }) as number;
        }
    });

    onMount(() => {
        initSpellcheck();
        editorStore.registerTextOperationCallback(handleTextOperation);
        window.addEventListener("open-find", handleGlobalFind);
        window.addEventListener("open-replace", handleGlobalReplace);
        return () => {
            editorStore.unregisterTextOperationCallback();
            window.removeEventListener("open-find", handleGlobalFind);
            window.removeEventListener("open-replace", handleGlobalReplace);
            cleanupScrollSync(scrollSyncState);
            if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);
        };
    });

    $effect(() => {
        if (spellcheckState.dictionaryLoaded) {
            const view = editorViewComponent?.getView();
            if (view) {
                refreshSpellcheck(view);
            }
        }
    });

    onDestroy(() => {
        editorStore.unregisterTextOperationCallback();
        window.removeEventListener("open-find", handleGlobalFind);
        window.removeEventListener("open-replace", handleGlobalReplace);
        cleanupScrollSync(scrollSyncState);
        if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);
    });

    $effect(() => {
        scrollDOM = editorViewComponent?.getScrollDOM() || null;
    });

    let currentTab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let initialContent = $derived(currentTab?.content || "");
    let filename = $derived(currentTab?.title || "");
    let combinedKeymap = $derived([...spellCheckKeymap]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative" onmouseenter={() => (isHovered = true)} onmouseleave={() => (isHovered = false)}>
    <EditorView bind:this={editorViewComponent} {tabId} {initialContent} {filename} customKeymap={combinedKeymap} {spellCheckLinter} {inputHandler} {eventHandlers} onContentChange={(content) => editorStore.updateContent(tabId, content)} onMetricsChange={(metrics) => editorStore.updateMetrics(metrics)} />
    {#if scrollDOM}
        <CustomScrollbar viewport={scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} editorView={editorViewComponent} />
</div>

{#if showContextMenu}
    <EditorContextMenu x={contextMenuX} y={contextMenuY} selectedText={contextSelectedText} wordUnderCursor={contextWordUnderCursor} onClose={() => (showContextMenu = false)} onDictionaryUpdate={handleDictionaryUpdate} onCut={handleCut} onCopy={handleCopy} onPaste={handlePaste} onReplaceWord={handleReplaceWord} />
{/if}
