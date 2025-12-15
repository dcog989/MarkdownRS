<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import EditorView from "./EditorView.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type TextOperation } from "$lib/stores/editorStore.svelte.ts";
    import { checkFileExists, addToDictionary } from "$lib/utils/fileSystem";
    import { formatMarkdown } from "$lib/utils/formatter";
    import { initSpellcheck, isWordValid, refreshCustomDictionary } from "$lib/utils/spellcheck";
    import { transformText } from "$lib/utils/textTransforms";
    import { linter, type Diagnostic } from "@codemirror/lint";
    import { EditorView as CM6EditorView } from "@codemirror/view";
    import { onMount, onDestroy, untrack } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let editorViewComponent: any;
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

    // Spellcheck Linter
    const spellCheckLinter = linter((view) => {
        const diagnostics: Diagnostic[] = [];
        const doc = view.state.doc;
        const wordRegex = /\b[a-zA-Z']+\b/g;
        const text = doc.toString();

        let match;
        while ((match = wordRegex.exec(text)) !== null) {
            const word = match[0];
            if (word.length > 1 && !isWordValid(word)) {
                diagnostics.push({
                    from: match.index,
                    to: match.index + word.length,
                    severity: "warning",
                    message: `Misspelled: ${word}`,
                    source: "Spellchecker",
                });
            }
        }

        return diagnostics;
    });

    async function refreshSpellcheck() {
        const view = editorViewComponent?.getView();
        if (!view) return;
        await refreshCustomDictionary();
        // Force linter to re-run
        view.dispatch({
            changes: { from: 0, to: 0, insert: " " },
        });
        view.dispatch({
            changes: { from: 0, to: 1, insert: "" },
        });
    }

    function handleTextOperation(operation: TextOperation) {
        const view = editorViewComponent?.getView();
        if (!view) return;

        const state = view.state;
        const doc = state.doc;
        const text = doc.toString();

        let newText: string;

        if (operation.type === "format-document") {
            newText = formatMarkdown(text, {
                listIndent: appState.formatterListIndent || 2,
                bulletChar: appState.formatterBulletChar || "-",
                codeBlockFence: appState.formatterCodeFence || "```",
                tableAlignment: appState.formatterTableAlignment !== false,
            });
        } else {
            newText = transformText(text, operation.type);
        }

        view.dispatch({
            changes: { from: 0, to: doc.length, insert: newText },
            userEvent: "input.complete",
        });
    }

    // Custom keymaps for F8 (add to dictionary)
    const customKeymap = [
        {
            key: "F8",
            run: (view: any) => {
                const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
                if (selection && selection.trim().length > 0) {
                    const words = selection.split(/\s+/);
                    Promise.all(words.map((w: string) => addToDictionary(w))).then(() => {
                        refreshSpellcheck();
                    });
                } else {
                    const range = view.state.wordAt(view.state.selection.main.head);
                    if (range) {
                        const word = view.state.sliceDoc(range.from, range.to);
                        addToDictionary(word).then(() => {
                            refreshSpellcheck();
                        });
                    }
                }
                return true;
            },
        },
    ];

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
                    
                    // Immediately update metrics for the new tab
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
                });
                checkFileExists(tabId);
            }
            previousTabId = tabId;
        }
    });

    // Scroll sync logic
    let currentTabState = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let targetScrollPercentage = $derived(currentTabState?.scrollPercentage ?? 0);

    $effect(() => {
        const target = targetScrollPercentage;
        const view = editorViewComponent?.getView();
        if (!view || !view.scrollDOM) return;

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
</script>

<div class="w-full h-full overflow-hidden bg-[#1e1e1e] relative">
    <EditorView
        bind:this={editorViewComponent}
        {tabId}
        {initialContent}
        {filename}
        {customKeymap}
        {spellCheckLinter}
        {inputHandler}
        {eventHandlers}
        onContentChange={(content) => editorStore.updateContent(tabId, content)}
        onMetricsChange={(metrics) => editorStore.updateMetrics(metrics)}
    />

    {#if scrollDOM}
        <CustomScrollbar viewport={scrollDOM} />
    {/if}
</div>

{#if showContextMenu}
    <EditorContextMenu
        x={contextMenuX}
        y={contextMenuY}
        selectedText={contextSelectedText}
        wordUnderCursor={contextWordUnderCursor}
        onClose={() => (showContextMenu = false)}
        onDictionaryUpdate={refreshSpellcheck}
    />
{/if}
