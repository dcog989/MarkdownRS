<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { editorMetrics } from "$lib/stores/editorMetrics.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists, navigateToPath } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatterRust";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { initSpellcheck } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap, triggerImmediateLint } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { transformText } from "$lib/utils/textTransformsRust";
    import { EditorView as CM6EditorView } from "@codemirror/view";
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

    const spellCheckLinter = createSpellCheckLinter();

    async function handleTextOperation(operation: TextOperation) {
        if (!cmView) return;
        const selection = cmView.state.selection.main;
        const hasSelection = selection.from !== selection.to;
        const targetText = hasSelection ? cmView.state.sliceDoc(selection.from, selection.to) : cmView.state.doc.toString();

        const newText = operation.type === "format-document" ? await formatMarkdown(targetText) : await transformText(targetText, operation.type);

        cmView.dispatch({
            changes: { from: hasSelection ? selection.from : 0, to: hasSelection ? selection.to : cmView.state.doc.length, insert: newText },
            selection: { anchor: (hasSelection ? selection.from : 0) + newText.length },
            userEvent: "input.complete",
        });
    }

    const eventHandlers = CM6EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos !== null) {
                    const line = view.state.doc.lineAt(pos);
                    const match = line.text.match(/(?:(?:^|\s)(?:[a-zA-Z]:[\\\/]|[\\\/]|\.\.?[\\\/])[a-zA-Z0-9._\-\/\\!@#$%^&()\[\]{}~`+]+)/);
                    if (match) navigateToPath(match[0].trim());
                }
            }
            return false;
        },
        contextmenu: (event, view) => {
            event.preventDefault();
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
            showContextMenu = true;
            return true;
        },
        scroll: () => scrollSync.syncPreviewToEditor(),
    });

    $effect(() => {
        if (tabId !== previousTabId) {
            const tab = editorStore.tabs.find((t) => t.id === tabId);
            if (tab && cmView) {
                untrack(() => {
                    if (cmView!.state.doc.toString() !== tab.content) {
                        cmView!.dispatch({ changes: { from: 0, to: cmView!.state.doc.length, insert: tab.content } });
                    }
                    triggerImmediateLint(cmView!);
                    checkFileExists(tabId);
                });
            }
            previousTabId = tabId;
        }
    });

    onMount(() => {
        initSpellcheck();
        editorStore.registerTextOperationCallback(handleTextOperation);
        window.addEventListener("open-find", () => {
            showFindReplace = true;
            tick().then(() => findReplacePanel?.focusInput());
        });
        return () => editorStore.unregisterTextOperationCallback();
    });

    let initialContent = $derived(editorStore.tabs.find((t) => t.id === tabId)?.content || "");
    let filename = $derived(editorStore.tabs.find((t) => t.id === tabId)?.title || "");
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView bind:this={editorViewComponent} bind:cmView {tabId} {initialContent} {filename} customKeymap={spellCheckKeymap} {spellCheckLinter} {eventHandlers} onContentChange={(c) => editorStore.updateContent(tabId, c)} onMetricsChange={(m) => editorMetrics.updateMetrics(m)} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} editorView={editorViewComponent} />
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
            cmView?.dispatch({ changes: { from: contextWordFrom, to: contextWordTo, insert: w } });
            refreshSpellcheck(cmView!);
        }}
    />
{/if}
