<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { getBackendCommand, type OperationId } from "$lib/config/textOperationsRegistry";
    import { initializeTabFileState } from "$lib/services/sessionPersistence";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatterRust";
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
    let showFindReplace = $state(false);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));

    $effect(() => {
        const tab = activeTab;
        if (!tab || !cmView) return;

        const content = tab.content;

        untrack(() => {
            const currentDoc = cmView!.state.doc.toString();

            if (currentDoc !== content) {
                const currentSelection = cmView!.state.selection.main;
                const newLength = content.length;

                cmView!.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: content },
                    selection: {
                        anchor: Math.min(currentSelection.anchor, newLength),
                        head: Math.min(currentSelection.head, newLength),
                    },
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

    async function handleTextOperation(operationId: OperationId) {
        if (!cmView) return;
        const selection = cmView.state.selection.main;
        const hasSelection = selection.from !== selection.to;
        const targetText = hasSelection ? cmView.state.sliceDoc(selection.from, selection.to) : cmView.state.doc.toString();

        const backendCommand = getBackendCommand(operationId);

        const newText = operationId === "format-document" ? await formatMarkdown(targetText) : await transformText(targetText, backendCommand);

        if (newText !== targetText) {
            cmView.dispatch({
                changes: { from: hasSelection ? selection.from : 0, to: hasSelection ? selection.to : cmView.state.doc.length, insert: newText },
                selection: { anchor: (hasSelection ? selection.from : 0) + newText.length },
                userEvent: "input.complete",
            });
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

                        // Extract chunk and strip common trailing punctuation that isn't part of paths/urls
                        targetString = text
                            .slice(start, end)
                            .replace(/[.,;:!?)\]]+$/, "")
                            .trim();
                    }
                }

                if (targetString) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    // If it looks like a web URL, open in browser, otherwise hand to system path navigator
                    if (/^(https?:\/\/|www\.)/i.test(targetString)) {
                        const url = targetString.startsWith("www") ? `https://${targetString}` : targetString;
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
        appContext.editor.registerTextOperationCallback(handleTextOperation);
        window.addEventListener("open-find", () => {
            showFindReplace = true;
            tick().then(() => findReplacePanel?.focusInput());
        });
        return () => appContext.editor.unregisterTextOperationCallback();
    });

    let initialContent = $derived(activeTab?.content || "");
    let filename = $derived(activeTab?.path || "unsaved.md");
</script>

<div class="w-full h-full overflow-hidden bg-bg-main relative">
    <EditorView bind:this={editorViewComponent} bind:cmView {tabId} {initialContent} {filename} customKeymap={spellCheckKeymap} spellCheckLinter={null} {eventHandlers} onContentChange={(c) => appContext.editor.updateContent(tabId, c)} onMetricsChange={(m) => appContext.metrics.updateMetrics(m)} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} {cmView} />
</div>

{#if showContextMenu}
    <EditorContextMenu
        x={contextMenuX}
        y={contextMenuY}
        selectedText={contextSelectedText}
        wordUnderCursor={contextWordUnderCursor}
        onClose={() => (showContextMenu = false)}
        onDictionaryUpdate={() => cmView && refreshSpellcheck(cmView)}
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
