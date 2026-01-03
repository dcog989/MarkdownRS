<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { getBackendCommand, type OperationId } from "$lib/config/textOperationsRegistry";
    import { initializeTabFileState } from "$lib/services/sessionPersistence";
    import { updateMetrics } from "$lib/stores/editorMetrics.svelte";
    import { registerTextOperationCallback, unregisterTextOperationCallback, updateContent, updateCursor, updateScroll } from "$lib/stores/editorStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { formatMarkdown } from "$lib/utils/formatterRust";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { searchState, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { initSpellcheck } from "$lib/utils/spellcheck.svelte.ts";
    import { refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { transformText } from "$lib/utils/textTransformsRust";
    import { syntaxTree } from "@codemirror/language";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { openPath } from "@tauri-apps/plugin-opener";
    import { onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let cmView = $state<CM6EditorView>();
    let findReplacePanel = $state<any>(null);
    let previousTabId: string = "";

    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));

    // Initialize LineChangeTracker for this tab if it doesn't exist
    $effect(() => {
        const tab = appContext.editor.tabs.find((t) => t.id === tabId);
        if (tab && !tab.lineChangeTracker) {
            tab.lineChangeTracker = new LineChangeTracker();
        }
    });

    $effect(() => {
        const tab = activeTab;
        if (!tab || !cmView) return;
        const content = tab.content;

        untrack(() => {
            const currentDoc = cmView!.state.doc.toString();
            if (currentDoc !== content) {
                const currentSelection = cmView!.state.selection.main;
                const newLength = content.length;

                // Snapshot scroll position before update
                const scrollDOM = cmView!.scrollDOM;
                const scrollTop = scrollDOM.scrollTop;
                const scrollLeft = scrollDOM.scrollLeft;

                cmView!.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: content },
                    selection: {
                        anchor: Math.min(currentSelection.anchor, newLength),
                        head: Math.min(currentSelection.head, newLength),
                    },
                    // Prevent CodeMirror from trying to snap to the cursor
                    scrollIntoView: false,
                });

                // Use requestAnimationFrame to ensure the DOM update has settled
                // before forcing the scroll position back.
                requestAnimationFrame(() => {
                    if (cmView && cmView.scrollDOM) {
                        cmView.scrollDOM.scrollTop = scrollTop;
                        cmView.scrollDOM.scrollLeft = scrollLeft;
                    }
                });
            }

            if (tabId !== previousTabId) {
                const currentTab = appContext.editor.tabs.find((t) => t.id === tabId);
                if (currentTab) {
                    initializeTabFileState(currentTab).catch(console.error);
                }
                previousTabId = tabId;
            }
        });
    });

    // Handle Find/Replace visibility from global store
    $effect(() => {
        if (appContext.interface.showFind) {
            tick().then(() => {
                findReplacePanel?.setReplaceMode(appContext.interface.isReplaceMode);
                findReplacePanel?.focusInput();
            });
        }
    });

    async function handleTextOperation(operationId: OperationId) {
        if (!cmView) return;
        const selection = cmView.state.selection.main;
        const hasSelection = selection.from !== selection.to;
        const targetText = hasSelection ? cmView.state.sliceDoc(selection.from, selection.to) : cmView.state.doc.toString();

        // Snapshot scroll and cursor
        const scrollTop = cmView.scrollDOM.scrollTop;

        const backendCommand = getBackendCommand(operationId);
        const newText = operationId === "format-document" ? await formatMarkdown(targetText) : await transformText(targetText, backendCommand);

        if (newText !== targetText) {
            const transaction: any = {
                changes: { from: hasSelection ? selection.from : 0, to: hasSelection ? selection.to : cmView.state.doc.length, insert: newText },
                userEvent: "input.complete",
            };

            if (hasSelection) {
                // Select the transformed text
                transaction.selection = { anchor: selection.from, head: selection.from + newText.length };
            } else {
                // Keep cursor roughly where it was (clamped to new length)
                const newLen = newText.length;
                transaction.selection = {
                    anchor: Math.min(selection.anchor, newLen),
                    head: Math.min(selection.head, newLen),
                };
            }

            cmView.dispatch(transaction);

            // Restore scroll for full document operations
            if (!hasSelection) {
                cmView.scrollDOM.scrollTop = scrollTop;
            }
        }
    }

    const eventHandlers = CM6EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos === null) return false;

                let targetString = "";

                // 1. Precise Syntax Tree Check for Markdown Link nodes
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

                // 2. Precise word-boundary extraction for raw URLs and Paths
                if (!targetString) {
                    const line = view.state.doc.lineAt(pos);
                    const text = line.text;
                    const posInLine = pos - line.from;

                    if (posInLine >= 0 && posInLine < text.length && /\S/.test(text[posInLine])) {
                        let start = posInLine;
                        // Expand left to whitespace
                        while (start > 0 && /\S/.test(text[start - 1])) start--;
                        let end = posInLine;
                        // Expand right to whitespace
                        while (end < text.length && /\S/.test(text[end])) end++;

                        // Extract chunk
                        targetString = text.slice(start, end).trim();

                        // Clean up wrapped characters (common in markdown like [text](url) or <url> or (url))
                        targetString = targetString.replace(/^[<(\[]+|[>)\]]+$/g, "");

                        // Only strip trailing punctuation if it doesn't look like a URL
                        // URLs can contain colons, so we need to be careful
                        if (!/^https?:\/\//i.test(targetString)) {
                            targetString = targetString.replace(/[.,;:!?)\]]+$/, "");
                        } else {
                            // For URLs, only strip very limited trailing punctuation that can't effectively end a URL
                            targetString = targetString.replace(/[.,;!?)\]]+$/, "");
                        }
                    }
                }

                if (targetString) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    // If it looks like a web URL, open in browser, otherwise hand to system path navigator
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

            if (showContextMenu) {
                showContextMenu = false;
            }

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

    // Editor view update when search changes
    $effect(() => {
        if (cmView && searchState.findText) {
            updateSearchEditor(cmView);
        }
    });

    let initialContent = $derived(activeTab?.content || "");

    // Dynamically calculate filename based on path or preferred extension for unsaved files
    let filename = $derived.by(() => {
        if (activeTab?.path) return activeTab.path;
        return activeTab?.preferredExtension === "txt" ? "unsaved.txt" : "unsaved.md";
    });

    // Explicitly determine if we should treat this as markdown
    let isMarkdown = $derived.by(() => {
        if (activeTab?.preferredExtension) {
            return activeTab.preferredExtension === "md";
        }
        return isMarkdownFile(filename);
    });

    let initialScroll = $derived(activeTab?.scrollPercentage || 0);
    let initialSelection = $derived(activeTab?.cursor || { anchor: 0, head: 0 });
    let lineChangeTracker = $derived(activeTab?.lineChangeTracker || new LineChangeTracker());

    // Show empty state when content is empty and file is unsaved
    let showEmptyState = $derived(activeTab && !activeTab.path && activeTab.content.trim() === "");
</script>

<div class="w-full h-full overflow-hidden bg-bg-main relative">
    <EditorView bind:this={editorViewComponent} bind:cmView {tabId} {initialContent} {filename} {isMarkdown} initialScrollPercentage={initialScroll} {initialSelection} {lineChangeTracker} customKeymap={spellCheckKeymap} spellCheckLinter={null} {eventHandlers} onContentChange={(c) => updateContent(tabId, c)} onMetricsChange={(m) => updateMetrics(m)} onScrollChange={(p, t) => updateScroll(tabId, p, t, "editor")} onSelectionChange={(a, h) => updateCursor(tabId, a, h)} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={appContext.interface.showFind} {cmView} />

    <!-- Empty State Overlay -->
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
        onDictionaryUpdate={() => {
            // No-op: We rely on the optimistic store update in ContextMenu to trigger
            // the EditorView reactivity. Calling refreshSpellcheck here would race with disk I/O.
        }}
        onCut={() => {
            navigator.clipboard.writeText(contextSelectedText);
            cmView?.dispatch({ changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: "" } });
        }}
        onCopy={() => navigator.clipboard.writeText(contextSelectedText)}
        onPaste={async () => {
            const t = await navigator.clipboard.readText();
            cmView?.dispatch({ changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: t }, selection: { anchor: cmView.state.selection.main.from + t.length }, scrollIntoView: true });
        }}
        onReplaceWord={(w) => {
            if (!cmView) return;
            cmView.dispatch({ changes: { from: contextWordFrom, to: contextWordTo, insert: w } });
            showContextMenu = false;
            setTimeout(() => {
                if (cmView) refreshSpellcheck(cmView);
            }, 50);
        }}
    />
{/if}
