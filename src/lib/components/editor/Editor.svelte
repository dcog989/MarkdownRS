<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { checkFileExists, navigateToPath } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatterRust";
    import { cleanupScrollSync, createScrollSyncState } from "$lib/utils/scrollSync";
    import { initSpellcheck, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap, triggerImmediateLint } from "$lib/utils/spellcheckExtension";
    import { transformText } from "$lib/utils/textTransformsRust";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onDestroy, onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let cmView = $state<CM6EditorView>();
    let findReplacePanel = $state<any>(null);
    let scrollDOM = $state<HTMLElement | null>(null);
    let previousTabId: string = "";

    const scrollSyncState = createScrollSyncState();

    let isFocused = $state(false);
    let isDragging = $state(false);

    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let showFindReplace = $state(false);

    const spellCheckLinter = createSpellCheckLinter();

    function handleDictionaryUpdate() {
        if (cmView) refreshSpellcheck(cmView);
    }

    async function handleCopy() {
        if (contextSelectedText) {
            await navigator.clipboard.writeText(contextSelectedText);
        }
    }

    async function handleCut() {
        if (cmView && contextSelectedText) {
            await navigator.clipboard.writeText(contextSelectedText);
            const selection = cmView.state.selection.main;
            cmView.dispatch({
                changes: { from: selection.from, to: selection.to, insert: "" },
                userEvent: "delete.cut",
            });
            cmView.focus();
        }
    }

    async function handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            if (cmView && text) {
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
                const selection = cmView.state.selection.main;
                cmView.dispatch({
                    changes: { from: selection.from, to: selection.to, insert: textToInsert },
                    selection: { anchor: selection.from + textToInsert.length },
                    userEvent: "input.paste",
                    scrollIntoView: true,
                });
                cmView.focus();
            }
        } catch (err) {
            console.error("Paste failed:", err);
        }
    }

    function handleReplaceWord(newWord: string) {
        if (cmView && contextWordFrom !== contextWordTo) {
            cmView.dispatch({
                changes: { from: contextWordFrom, to: contextWordTo, insert: newWord },
                userEvent: "input.spellcheck",
            });
            refreshSpellcheck(cmView);
        }
    }

    async function handleTextOperation(operation: TextOperation) {
        if (!cmView) return;
        const state = cmView.state;
        const doc = state.doc;
        const selection = state.selection.main;
        const hasSelection = selection.from !== selection.to;
        let newText: string;
        let from: number;
        let to: number;

        const simpleTransforms = ["uppercase", "to-uppercase", "lowercase", "to-lowercase", "trim-whitespace", "remove-all-spaces"];

        if (simpleTransforms.includes(operation.type)) {
            const targetText = hasSelection ? state.sliceDoc(selection.from, selection.to) : doc.toString();
            from = hasSelection ? selection.from : 0;
            to = hasSelection ? selection.to : doc.length;

            switch (operation.type) {
                case "uppercase":
                case "to-uppercase":
                    newText = targetText.toUpperCase();
                    break;
                case "lowercase":
                case "to-lowercase":
                    newText = targetText.toLowerCase();
                    break;
                case "trim-whitespace":
                    newText = targetText.trim();
                    break;
                case "remove-all-spaces":
                    newText = targetText.replace(/\s+/g, "");
                    break;
                default:
                    newText = targetText;
            }
        } else if (operation.type === "format-document") {
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

        cmView.dispatch({
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
            isDragging = true;
            window.addEventListener("mouseup", () => (isDragging = false), { once: true });

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
        contextmenu: (event, view) => {
            event.preventDefault();
            const selection = view.state.selection.main;
            const selectedText = view.state.sliceDoc(selection.from, selection.to);

            let wordUnderCursor = "";
            let from = 0;
            let to = 0;

            if (!selectedText || selectedText.trim().split(/\s+/).length === 1) {
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
            // Source: Editor
            // If the last scroll came from preview, we might still be settling.
            if (scrollSyncState.isRemoteScrolling) return;

            const dom = view.scrollDOM;
            const maxScroll = dom.scrollHeight - dom.clientHeight;
            if (maxScroll <= 0) return;

            const scrollTop = dom.scrollTop;

            if (Math.abs(scrollTop - maxScroll) < 5) {
                editorStore.updateScroll(tabId, 1, view.state.doc.lines, "editor");
                return;
            }

            if (scrollTop === 0) {
                editorStore.updateScroll(tabId, 0, 1, "editor");
                return;
            }

            const lineBlock = view.lineBlockAtHeight(scrollTop);
            const lineNum = view.state.doc.lineAt(lineBlock.from).number;
            const progress = (scrollTop - lineBlock.top) / Math.max(1, lineBlock.height);
            const preciseLine = lineNum + progress;
            const percentage = scrollTop / maxScroll;

            editorStore.updateScroll(tabId, percentage, preciseLine, "editor");
        },
        focus: () => {
            setTimeout(() => {
                isFocused = true;
            }, 0);
        },
        blur: () => {
            setTimeout(() => {
                isFocused = false;
            }, 0);
        },
    });

    // Receiver: Editor
    $effect(() => {
        if (!cmView || !cmView.scrollDOM || previousTabId !== tabId) return;

        // If the source was the Editor, do NOT apply the scroll back.
        if (editorStore.lastScrollSource === "editor") return;

        const targetLine = currentTabState?.topLine;
        const targetPercent = currentTabState?.scrollPercentage;

        if (targetLine === undefined || targetPercent === undefined) return;

        const dom = cmView.scrollDOM;

        scrollSyncState.isRemoteScrolling = true;
        dom.style.scrollBehavior = "auto";

        if (targetPercent >= 0.99 || targetLine >= editorStore.lineCount - 1) {
            dom.scrollTop = dom.scrollHeight - dom.clientHeight;
        } else if (targetLine <= 1.05) {
            dom.scrollTop = 0;
        } else {
            try {
                const lineInt = Math.floor(targetLine);
                const progress = targetLine - lineInt;
                const lineBlock = cmView.lineBlockAt(cmView.state.doc.line(lineInt).from);
                const targetScroll = lineBlock.top + lineBlock.height * progress;
                dom.scrollTop = targetScroll;
            } catch (e) {
                const scrollHeight = dom.scrollHeight - dom.clientHeight;
                dom.scrollTop = scrollHeight * targetPercent;
            }
        }

        if (scrollSyncState.lockTimeout) clearTimeout(scrollSyncState.lockTimeout);
        scrollSyncState.lockTimeout = window.setTimeout(() => {
            scrollSyncState.isRemoteScrolling = false;
            if (dom) dom.style.scrollBehavior = "";
        }, 60);
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
        if (spellcheckState.dictionaryLoaded && cmView) {
            untrack(() => {
                setTimeout(() => {
                    if (cmView) triggerImmediateLint(cmView);
                }, CONFIG.SPELLCHECK.STARTUP_DELAY_MS);
            });
        }
    });

    $effect(() => {
        if (tabId !== previousTabId) {
            const currentTab = editorStore.tabs.find((t: EditorTab) => t.id === tabId);
            if (currentTab && cmView) {
                untrack(() => {
                    const currentDoc = cmView!.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        cmView!.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
                    }

                    const doc = cmView!.state.doc;
                    const selection = cmView!.state.selection.main;
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

                    triggerImmediateLint(cmView!);

                    setTimeout(() => {
                        if (cmView!.scrollDOM && currentTab.scrollPercentage >= 0) {
                            const dom = cmView!.scrollDOM;
                            const originalBehavior = dom.style.scrollBehavior;

                            dom.style.scrollBehavior = "auto";
                            scrollSyncState.isRemoteScrolling = true;

                            if (currentTab.topLine && currentTab.topLine > 1) {
                                try {
                                    const lineInt = Math.floor(currentTab.topLine);
                                    const lineBlock = cmView!.lineBlockAt(cmView!.state.doc.line(lineInt).from);
                                    dom.scrollTop = lineBlock.top;
                                } catch (e) {
                                    dom.scrollTop = (dom.scrollHeight - dom.clientHeight) * currentTab.scrollPercentage;
                                }
                            } else {
                                dom.scrollTop = (dom.scrollHeight - dom.clientHeight) * currentTab.scrollPercentage;
                            }

                            requestAnimationFrame(() => {
                                dom.style.scrollBehavior = originalBehavior;
                                scrollSyncState.isRemoteScrolling = false;
                            });
                        }
                    }, 0);

                    checkFileExists(tabId);
                });
            }
            previousTabId = tabId;
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
        };
    });

    onDestroy(() => {
        editorStore.unregisterTextOperationCallback();
        window.removeEventListener("open-find", handleGlobalFind);
        window.removeEventListener("open-replace", handleGlobalReplace);
        cleanupScrollSync(scrollSyncState);
    });

    $effect(() => {
        scrollDOM = cmView?.scrollDOM || null;
    });

    let currentTabState = $derived(editorStore.tabs.find((t: EditorTab) => t.id === tabId));
    let initialContent = $derived(currentTabState?.content || "");
    let filename = $derived(currentTabState?.title || "");
    let combinedKeymap = $derived([...spellCheckKeymap]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView bind:this={editorViewComponent} bind:cmView {tabId} {initialContent} {filename} customKeymap={combinedKeymap} {spellCheckLinter} {inputHandler} {eventHandlers} onContentChange={(content) => editorStore.updateContent(tabId, content)} onMetricsChange={(metrics) => editorStore.updateMetrics(metrics)} />
    {#if scrollDOM}
        <CustomScrollbar viewport={scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} editorView={editorViewComponent} />
</div>

{#if showContextMenu}
    <EditorContextMenu x={contextMenuX} y={contextMenuY} selectedText={contextSelectedText} wordUnderCursor={contextWordUnderCursor} onClose={() => (showContextMenu = false)} onDictionaryUpdate={handleDictionaryUpdate} onCut={handleCut} onCopy={handleCopy} onPaste={handlePaste} onReplaceWord={handleReplaceWord} />
{/if}
