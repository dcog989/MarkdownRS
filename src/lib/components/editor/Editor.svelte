<script lang="ts">
    import { createEditorEventHandlers } from "$lib/components/editor/codemirror/events";
    import { performTextOperation } from "$lib/components/editor/logic/operations";
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import EditorContextMenu from "$lib/components/ui/EditorContextMenu.svelte";
    import FindReplacePanel from "$lib/components/ui/FindReplacePanel.svelte";
    import { updateMetrics } from "$lib/stores/editorMetrics.svelte";
    import {
        editorStore,
        updateContent,
        updateCursor,
        updateHistoryState,
        updateScroll,
    } from "$lib/stores/editorStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { ScrollManager } from "$lib/utils/cmScroll";
    import { CONFIG } from "$lib/utils/config";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
    import { searchState, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { initSpellcheck } from "$lib/utils/spellcheck.svelte.ts";
    import { refreshSpellcheck, spellCheckKeymap } from "$lib/utils/spellcheckExtension.svelte.ts";
    import { readText } from "@tauri-apps/plugin-clipboard-manager";
    import { onMount, tick, untrack } from "svelte";
    import EditorView from "./EditorView.svelte";
    // Imports for type only
    import type { EditorView as CM6EditorView } from "@codemirror/view";

    let { tabId } = $props<{ tabId: string }>();

    let cmView = $state<CM6EditorView & { getHistoryState?: () => any }>();
    let findReplacePanel = $state<any>(null);
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state("");
    let contextWordUnderCursor = $state("");
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let pendingTransform = $derived(editorStore.pendingTransform);

    // Logic State
    let scrollManager = new ScrollManager();
    let previousTabId: string = "";
    let isTransforming = $state(false);
    let lastForceSyncCounter = $state(0);

    // Initialize Helpers
    const eventHandlers = createEditorEventHandlers(onContextMenu);
    
    // Global flush function accessible from window for shutdown
    if (typeof window !== 'undefined') {
        if (!(window as any)._editorFlushFunctions) {
            (window as any)._editorFlushFunctions = [];
        }
        const flushFn = () => {
            if (cmView && (cmView as any).flushPendingContent) {
                (cmView as any).flushPendingContent();
            }
        };
        (window as any)._editorFlushFunctions.push(flushFn);
    }

    onMount(() => {
        initSpellcheck();
    });

    $effect(() => {
        const tab = appContext.editor.tabs.find((t) => t.id === tabId);
        if (tab && !tab.lineChangeTracker) {
            tab.lineChangeTracker = new LineChangeTracker();
        }
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

    // Reactive Command Listener
    $effect(() => {
        if (pendingTransform && pendingTransform.tabId === tabId && cmView) {
            untrack(() => {
                performTextOperation(
                    cmView!,
                    pendingTransform!.op,
                    scrollManager,
                    (val) => (isTransforming = val)
                );
            });
        }
    });

    // Tab Switch State Saver and Sync
    $effect(() => {
        const currentTabId = tabId;
        const currentView = cmView;

        untrack(() => {
            if (
                previousTabId &&
                previousTabId !== currentTabId &&
                currentView &&
                currentView.getHistoryState
            ) {
                // Save history of the outgoing tab BEFORE the props update propagates down to EditorView
                updateHistoryState(previousTabId, currentView.getHistoryState());
            }
            previousTabId = currentTabId;
        });
    });

    function onContextMenu(event: MouseEvent, view: CM6EditorView) {
        event.preventDefault();
        showContextMenu = false;
        const selection = view.state.selection.main;
        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        let word = "",
            from = 0,
            to = 0;
        if (!selectedText || selectedText.trim().split(/\s+/).length === 1) {
            const range = view.state.wordAt(
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? selection.head
            );
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
    }

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
    function handleHistoryUpdate(state: any) {
        updateHistoryState(tabId, state);
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
    let lineChangeTracker = $derived(activeTab?.lineChangeTracker);
    let showEmptyState = $derived(activeTab && !activeTab.path && activeTab.content.trim() === "");
</script>

<div class="w-full h-full overflow-hidden bg-bg-main relative">
    <EditorView
        bind:cmView
        {tabId}
        {initialContent}
        {filename}
        {isMarkdown}
        initialScrollPercentage={initialScroll}
        {initialSelection}
        {initialHistoryState}
        {lineChangeTracker}
        customKeymap={spellCheckKeymap}
        spellCheckLinter={null}
        {eventHandlers}
        onContentChange={handleContentChange}
        onMetricsChange={handleMetricsChange}
        onScrollChange={handleScrollChange}
        onSelectionChange={handleSelectionChange}
        onHistoryUpdate={handleHistoryUpdate}
    />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel
        bind:this={findReplacePanel}
        bind:isOpen={appContext.interface.showFind}
        {cmView}
    />

    {#if showEmptyState}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <img
                src="/logo.svg"
                alt="MarkdownRS Logo"
                class="w-48 h-48 opacity-[0.08] select-none"
            />
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
            cmView.dispatch({
                changes: {
                    from: cmView.state.selection.main.from,
                    to: cmView.state.selection.main.to,
                    insert: "",
                },
            });
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
                        changes: {
                            from: cmView.state.selection.main.from,
                            to: cmView.state.selection.main.to,
                            insert: t,
                        },
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
