<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import type { OperationId } from "$lib/config/textOperationsRegistry";
    import { initializeTabFileState } from "$lib/services/sessionPersistence";
    import { updateMetrics } from "$lib/stores/editorMetrics.svelte";
    import { registerTextOperationCallback, unregisterTextOperationCallback, updateContent, updateCursor, updateHistoryState, updateScroll } from "$lib/stores/editorStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { ScrollManager } from "$lib/utils/cmScroll";
    import { CONFIG } from "$lib/utils/config";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { searchState, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { initSpellcheck } from "$lib/utils/spellcheck.svelte.ts";
    import { refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { transformText } from "$lib/utils/textTransforms";
    import { syntaxTree } from "@codemirror/language";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { readText } from "@tauri-apps/plugin-clipboard-manager";
    import { openPath } from "@tauri-apps/plugin-opener";
    import { onDestroy, onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let cmView = $state<CM6EditorView & { getHistoryState?: () => any }>();
    let findReplacePanel = $state<any>(null);
    let previousTabId: string = "";
    let isTransforming = false;

    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let scrollManager = new ScrollManager();

    $effect(() => {
        const tab = appContext.editor.tabs.find((t) => t.id === tabId);
        if (tab && !tab.lineChangeTracker) {
            tab.lineChangeTracker = new LineChangeTracker();
        }
    });

    $effect(() => {
        const currentTabId = tabId;
        const tab = activeTab;

        if (!tab || !cmView) return;

        untrack(() => {
            const isTabSwitch = currentTabId !== previousTabId;

            if (isTabSwitch) {
                const currentTab = appContext.editor.tabs.find((t) => t.id === currentTabId);
                if (currentTab) {
                    initializeTabFileState(currentTab).catch(console.error);
                }
                previousTabId = currentTabId;
            }

            const currentDoc = cmView!.state.doc.toString();
            const newContent = tab.content;

            // If content is not yet loaded, we skip updating CodeMirror to avoid flickering empty strings
            if (!tab.contentLoaded && newContent === "") {
                return;
            }

            if (currentDoc !== newContent || isTabSwitch) {
                if (isTabSwitch) scrollManager.capture(cmView!, "Tab Switch");

                const newLength = newContent.length;
                const currentSelection = cmView!.state.selection.main;

                cmView!.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: newContent },
                    selection: {
                        anchor: Math.min(currentSelection.anchor, newLength),
                        head: Math.min(currentSelection.head, newLength),
                    },
                    scrollIntoView: false,
                });

                requestAnimationFrame(() => {
                    if (cmView) {
                        cmView.requestMeasure();
                        if (isTabSwitch) {
                            scrollManager.restore(cmView, "pixel");
                            cmView.focus();
                        }
                    }
                });
            }
        });
    });

    $effect(() => {
        const tab = activeTab;
        if (!tab || !cmView) return;

        const content = tab.content;
        const currentTabId = tabId;

        untrack(() => {
            if (currentTabId !== previousTabId) return;

            const currentDoc = cmView!.state.doc.toString();
            if (currentDoc !== content) {
                if (!cmView!.hasFocus && !isTransforming) {
                    scrollManager.capture(cmView!, "External Update");
                    const currentSelection = cmView!.state.selection.main;
                    const newLength = content.length;

                    cmView!.dispatch({
                        changes: { from: 0, to: currentDoc.length, insert: content },
                        selection: {
                            anchor: Math.min(currentSelection.anchor, newLength),
                            head: Math.min(currentSelection.head, newLength),
                        },
                        scrollIntoView: false,
                    });

                    requestAnimationFrame(() => {
                        if (cmView) {
                            cmView.requestMeasure();
                            scrollManager.restore(cmView, "pixel");
                        }
                    });
                }
            }
        });
    });

    $effect(() => {
        if (appContext.interface.showFind) {
            tick().then(() => {
                findReplacePanel?.setReplaceMode(appContext.interface.isReplaceMode);
                findReplacePanel?.focusInput();
            });
        }
    });

    $effect(() => {
        if (cmView && searchState.findText) {
            updateSearchEditor(cmView);
        }
    });

    async function handleTextOperation(operationId: OperationId) {
        if (!cmView) return;

        isTransforming = true;
        const selection = cmView.state.selection.main;
        const hasSelection = selection.from !== selection.to;
        const targetText = hasSelection ? cmView.state.sliceDoc(selection.from, selection.to) : cmView.state.doc.toString();

        scrollManager.capture(cmView, `Op:${operationId}`);
        const newText = await transformText(targetText, operationId);

        if (newText !== targetText) {
            cmView.focus();

            const transaction: any = {
                changes: {
                    from: hasSelection ? selection.from : 0,
                    to: hasSelection ? selection.to : cmView.state.doc.length,
                    insert: newText,
                },
                userEvent: "input.complete",
                scrollIntoView: true,
            };

            if (hasSelection) {
                transaction.selection = {
                    anchor: selection.from,
                    head: selection.from + newText.length,
                };
            } else {
                const newLen = newText.length;
                transaction.selection = {
                    anchor: Math.min(selection.anchor, newLen),
                    head: Math.min(selection.head, newLen),
                };
            }

            cmView.dispatch(transaction);

            if (!hasSelection) {
                const snapshot = scrollManager.getSnapshot();
                const currentLines = cmView.state.doc.lines;
                let strategy: "anchor" | "pixel" = "pixel";
                if (operationId === "format-document") {
                    strategy = "anchor";
                } else if (snapshot && Math.abs(currentLines - snapshot.totalLines) > 0) {
                    strategy = "anchor";
                }
                scrollManager.restore(cmView, strategy);
            }
        }

        setTimeout(() => {
            isTransforming = false;
        }, 100);
    }

    const eventHandlers = CM6EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos === null) return false;
                let targetString = "";
                let node = syntaxTree(view.state).resolveInner(pos, 1);
                while (node && node.parent && !["URL", "Link", "LinkEmail"].includes(node.name)) {
                    node = node.parent;
                }
                if (node && ["URL", "Link", "LinkEmail"].includes(node.name)) {
                    if (node.name === "Link") {
                        const urlNode = node.node.getChild("URL");
                        if (urlNode) targetString = view.state.sliceDoc(urlNode.from, urlNode.to);
                    } else {
                        targetString = view.state.sliceDoc(node.from, node.to);
                    }
                }
                if (!targetString) {
                    const line = view.state.doc.lineAt(pos);
                    const text = line.text;
                    const posInLine = pos - line.from;
                    if (posInLine >= 0 && posInLine < text.length && /\S/.test(text[posInLine])) {
                        let start = posInLine;
                        while (start > 0 && /\S/.test(text[start - 1])) start--;
                        let end = posInLine;
                        while (end < text.length && /\S/.test(text[end])) end++;
                        targetString = text.slice(start, end).trim();
                        targetString = targetString.replace(/^[<(\[]+|[>)\]]+$/g, "");
                        if (!/^https?:\/\//i.test(targetString)) {
                            targetString = targetString.replace(/[.,;:!?)\]]+$/, "");
                        } else {
                            targetString = targetString.replace(/[.,;!?)\]]+$/, "");
                        }
                    }
                }
                if (targetString) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (/^(https?:\/\/|www\.)/i.test(targetString)) {
                        const url = targetString.startsWith("www.") ? `https://${targetString}` : targetString;
                        openPath(url).catch(() => {});
                    } else {
                        navigateToPath(targetString);
                    }
                    return true;
                }
            }
            return false;
        },
        contextmenu: (event, view) => {
            event.preventDefault();
            showContextMenu = false;
            const selection = view.state.selection.main;
            const selectedText = view.state.sliceDoc(selection.from, selection.to);
            let word = "",
                from = 0,
                to = 0;
            if (!selectedText || selectedText.trim().split(/\s+/).length === 1) {
                const range = view.state.wordAt(view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? selection.head);
                if (range) {
                    from = range.from;
                    to = range.to;
                    word = view.state.sliceDoc(from, to).replace(/[^a-zA-Z']/g, "");
                }
            }
            contextSelectedText = selectedText;
            contextWordUnderCursor = word;
            contextWordFrom = from;
            contextWordTo = to;
            contextMenuX = event.clientX;
            contextMenuY = event.clientY;
            tick().then(() => {
                showContextMenu = true;
            });
            return true;
        },
    });

    onMount(() => {
        initSpellcheck();
        registerTextOperationCallback(handleTextOperation);
        return () => unregisterTextOperationCallback();
    });

    onDestroy(() => {
        if (cmView && cmView.getHistoryState) {
            const state = cmView.getHistoryState();
            if (state) {
                updateHistoryState(tabId, state);
            }
        }
    });

    function handleContentChange(c: string) {
        updateContent(tabId, c);
    }
    function handleMetricsChange(m: any) {
        updateMetrics(m);
    }
    function handleScrollChange(p: number, t: number) {
        updateScroll(tabId, p, t, "editor");
    }
    function handleSelectionChange(a: number, h: number) {
        updateCursor(tabId, a, h);
    }

    let initialContent = $derived(activeTab?.content || "");
    let filename = $derived.by(() => {
        if (activeTab?.path) return activeTab.path;
        return activeTab?.preferredExtension === "txt" ? "unsaved.txt" : "unsaved.md";
    });
    let isMarkdown = $derived.by(() => {
        if (activeTab?.preferredExtension) {
            return activeTab.preferredExtension === "md";
        }
        return isMarkdownFile(filename);
    });
    let initialScroll = $derived(activeTab?.scrollPercentage || 0);
    let initialSelection = $derived(activeTab?.cursor || { anchor: 0, head: 0 });
    let initialHistoryState = $derived(activeTab?.historyState || undefined);
    let lineChangeTracker = $derived(activeTab?.lineChangeTracker || new LineChangeTracker());
    let showEmptyState = $derived(activeTab && !activeTab.path && activeTab.content.trim() === "");
</script>

<div class="w-full h-full overflow-hidden bg-bg-main relative">
    <EditorView bind:cmView {tabId} {initialContent} {filename} {isMarkdown} initialScrollPercentage={initialScroll} {initialSelection} {initialHistoryState} {lineChangeTracker} customKeymap={spellCheckKeymap} spellCheckLinter={null} {eventHandlers} onContentChange={handleContentChange} onMetricsChange={handleMetricsChange} onScrollChange={handleScrollChange} onSelectionChange={handleSelectionChange} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={appContext.interface.showFind} {cmView} />

    {#if showEmptyState}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <img src="/logo.svg" alt="MarkdownRS Logo" class="w-48 h-48 opacity-[0.08] select-none" />
        </div>
    {/if}
</div>

{#if showContextMenu}
    <EditorContextMenu
        x={contextMenuX}
        y={contextMenuY}
        selectedText={contextSelectedText}
        wordUnderCursor={contextWordUnderCursor}
        onClose={() => (showContextMenu = false)}
        onDictionaryUpdate={() => {}}
        onCut={() => {
            navigator.clipboard.writeText(contextSelectedText);
            if (!cmView) return;
            cmView.dispatch({ changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: "" } });
        }}
        onCopy={() => navigator.clipboard.writeText(contextSelectedText)}
        onPaste={async () => {
            if (!cmView) return;
            showContextMenu = false;
            cmView.focus();
            try {
                const t = await readText();
                if (t) {
                    cmView.dispatch({
                        changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: t },
                        selection: { anchor: cmView.state.selection.main.from + t.length },
                        scrollIntoView: true,
                    });
                }
            } catch (err) {
                console.error("Paste failed:", err);
            }
        }}
        onReplaceWord={(w) => {
            if (!cmView) return;
            cmView.dispatch({ changes: { from: contextWordFrom, to: contextWordTo, insert: w } });
            showContextMenu = false;
            setTimeout(() => {
                if (cmView) refreshSpellcheck(cmView);
            }, CONFIG.SPELLCHECK.REFRESH_DELAY_MS);
        }}
    />
{/if}
