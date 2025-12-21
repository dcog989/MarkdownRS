<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists, navigateToPath } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatterRust";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { initSpellcheck } from "$lib/utils/spellcheck.svelte.ts";
    import { createSpellCheckLinter, refreshSpellcheck, spellCheckKeymap, triggerImmediateLint } from "$lib/utils/spellcheckExtension";
    import { transformText } from "$lib/utils/textTransformsRust";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent = $state<any>(null);
    let cmView = $state<CM6EditorView>();
    let findReplacePanel = $state<any>(null);
    let previousTabId: string = "";

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
        if (contextSelectedText) await navigator.clipboard.writeText(contextSelectedText);
    }

    async function handleCut() {
        if (cmView && contextSelectedText) {
            await navigator.clipboard.writeText(contextSelectedText);
            cmView.dispatch({
                changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: "" },
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
                    textToInsert = await formatMarkdown(text, {
                        listIndent: appState.formatterListIndent || 2,
                        bulletChar: appState.formatterBulletChar || "-",
                        codeBlockFence: appState.formatterCodeFence || "```",
                        tableAlignment: appState.formatterTableAlignment !== false,
                    });
                }
                cmView.dispatch({
                    changes: { from: cmView.state.selection.main.from, to: cmView.state.selection.main.to, insert: textToInsert },
                    selection: { anchor: cmView.state.selection.main.from + textToInsert.length },
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

        if (operation.type === "format-document") {
            const targetText = hasSelection ? state.sliceDoc(selection.from, selection.to) : doc.toString();
            newText = await formatMarkdown(targetText, {
                listIndent: appState.formatterListIndent || 2,
                bulletChar: appState.formatterBulletChar || "-",
                codeBlockFence: appState.formatterCodeFence || "```",
                tableAlignment: appState.formatterTableAlignment !== false,
            });
            from = hasSelection ? selection.from : 0;
            to = hasSelection ? selection.to : doc.length;
        } else {
            const targetText = hasSelection ? state.sliceDoc(selection.from, selection.to) : doc.toString();
            newText = await transformText(targetText, operation.type);
            from = hasSelection ? selection.from : 0;
            to = hasSelection ? selection.to : doc.length;
        }

        cmView.dispatch({
            changes: { from, to, insert: newText },
            selection: { anchor: from + newText.length },
            userEvent: "input.complete",
        });
    }

    const inputHandler = CM6EditorView.inputHandler.of((view, from, to, text) => {
        if (editorStore.insertMode === "OVR" && from === to && text.length === 1) {
            const line = view.state.doc.lineAt(from);
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
                        const start = line.from + match.index;
                        const end = start + match[0].length;
                        if (pos >= start && pos <= end) {
                            navigateToPath(match[0].trim());
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
            let from = 0,
                to = 0;

            if (!selectedText || selectedText.trim().split(/\s+/).length === 1) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                const range = view.state.wordAt(pos ?? selection.head);
                if (range) {
                    from = range.from;
                    to = range.to;
                    wordUnderCursor = view.state.sliceDoc(from, to).replace(/[^a-zA-Z']/g, "");
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
        scroll: () => {
            scrollSync.syncPreviewToEditor();
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
            const currentTab = editorStore.tabs.find((t: EditorTab) => t.id === tabId);
            if (currentTab && cmView) {
                untrack(() => {
                    const currentDoc = cmView!.state.doc.toString();
                    if (currentDoc !== currentTab.content) {
                        cmView!.dispatch({
                            changes: { from: 0, to: currentDoc.length, insert: currentTab.content },
                        });
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
        window.addEventListener("open-find", handleGlobalFind);
        window.addEventListener("open-replace", handleGlobalReplace);

        return () => {
            editorStore.unregisterTextOperationCallback();
            window.removeEventListener("open-find", handleGlobalFind);
            window.removeEventListener("open-replace", handleGlobalReplace);
        };
    });

    let currentTabState = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let initialContent = $derived(currentTabState?.content || "");
    let filename = $derived(currentTabState?.title || "");
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView bind:this={editorViewComponent} bind:cmView {tabId} {initialContent} {filename} customKeymap={spellCheckKeymap} {spellCheckLinter} {inputHandler} {eventHandlers} onContentChange={(c) => editorStore.updateContent(tabId, c)} onMetricsChange={(m) => editorStore.updateMetrics(m)} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={showFindReplace} editorView={editorViewComponent} />
</div>

{#if showContextMenu}
    <EditorContextMenu x={contextMenuX} y={contextMenuY} selectedText={contextSelectedText} wordUnderCursor={contextWordUnderCursor} onClose={() => (showContextMenu = false)} onDictionaryUpdate={handleDictionaryUpdate} onCut={handleCut} onCopy={handleCopy} onPaste={handlePaste} onReplaceWord={handleReplaceWord} />
{/if}
