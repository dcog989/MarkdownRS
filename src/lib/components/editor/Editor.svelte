<script lang="ts">
    import { createEditorEventHandlers } from '$lib/components/editor/codemirror/events';
    import { performTextOperation } from '$lib/components/editor/logic/operations';
    import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
    import EditorContextMenu from '$lib/components/ui/EditorContextMenu.svelte';
    import FindReplacePanel from '$lib/components/ui/FindReplacePanel.svelte';
    import { updateMetrics, type EditorMetrics } from '$lib/stores/editorMetrics.svelte';
    import {
        editorStore,
        getHistoryState,
        getLineChangeTracker,
        updateContent,
        updateCursor,
        updateHistoryState,
        updateScroll,
    } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { ScrollManager } from '$lib/utils/cmScroll';
    import { CONFIG } from '$lib/utils/config';
    import { registerEditorInstance, unregisterEditorInstance } from '$lib/utils/editorCommands';
    import { AppError } from '$lib/utils/errorHandling';
    import { isMarkdownFile } from '$lib/utils/fileValidation';
    import { searchState, updateSearchEditor } from '$lib/utils/searchManager.svelte.ts';
    import { initSpellcheck } from '$lib/utils/spellcheck.svelte.ts';
    import {
        invalidateSpellcheckCache,
        refreshSpellcheck,
        spellCheckKeymap,
        triggerImmediateLint,
    } from '$lib/utils/spellcheckExtension.svelte.ts';
    import type { EditorView as CM6EditorView } from '@codemirror/view';
    import { readText } from '@tauri-apps/plugin-clipboard-manager';
    import { onMount, tick, untrack } from 'svelte';
    import EditorViewComponent from './EditorView.svelte';

    let { tabId } = $props<{ tabId: string }>();

    let cmView = $state<
        CM6EditorView & { getHistoryState?: () => unknown; flushPendingContent?: () => void }
    >();
    let findReplacePanel = $state<{
        setReplaceMode: (enable: boolean) => void;
        focusInput: () => void;
    } | null>(null);
    let showContextMenu = $state(false);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let contextSelectedText = $state('');
    let contextWordUnderCursor = $state('');
    let contextWordFrom = $state(0);
    let contextWordTo = $state(0);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let pendingTransform = $derived(editorStore.pendingTransform);

    // Logic State
    let scrollManager = new ScrollManager();
    let previousTabId: string = '';

    // Initialize Helpers
    const eventHandlers = createEditorEventHandlers(onContextMenu);

    // Global flush function accessible from window for shutdown
    let flushFn: (() => void) | null = null;
    if (typeof window !== 'undefined') {
        const win = window as unknown as { _editorFlushFunctions: (() => void)[] };
        if (!win._editorFlushFunctions) {
            win._editorFlushFunctions = [];
        }
        flushFn = () => {
            if (cmView?.flushPendingContent) {
                cmView.flushPendingContent();
            }
        };
        win._editorFlushFunctions.push(flushFn);
    }

    onMount(() => {
        initSpellcheck();

        return () => {
            // Cleanup: unregister editor instance and remove flush function when component is destroyed
            unregisterEditorInstance(tabId);
            if (flushFn) {
                const win = window as unknown as { _editorFlushFunctions: (() => void)[] };
                const index = win._editorFlushFunctions.indexOf(flushFn);
                if (index > -1) {
                    win._editorFlushFunctions.splice(index, 1);
                }
            }
        };
    });

    // Register/unregister editor instance when cmView changes
    $effect(() => {
        if (cmView) {
            registerEditorInstance(tabId, cmView);
        } else {
            unregisterEditorInstance(tabId);
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
            const currentOp = pendingTransform.op;
            // Consume the command immediately so it doesn't re-run on tab switches or remounts
            editorStore.pendingTransform = null;

            untrack(() => {
                performTextOperation(cmView!, currentOp, scrollManager);
            });
        }
    });

    // Tab Switch Flag Manager
    $effect(() => {
        const currentTabId = tabId;

        untrack(() => {
            if (previousTabId && previousTabId !== currentTabId) {
                // Set flag to prevent auto-format during tab switch
                appContext.app.isTabSwitching = true;

                // History state is saved by EditorView component during tab switch
                // to ensure it happens at the correct point in the lifecycle

                // Clear the flag after a short delay to allow tab switch to complete
                setTimeout(() => {
                    appContext.app.isTabSwitching = false;
                }, CONFIG.UI_TIMING.MRU_POPUP_DELAY_MS);
            }
            previousTabId = currentTabId;
        });
    });

    function onContextMenu(event: MouseEvent, view: CM6EditorView) {
        event.preventDefault();
        showContextMenu = false;
        const selection = view.state.selection.main;
        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        let word = '',
            from = 0,
            to = 0;
        if (!selectedText || selectedText.trim().split(/\s+/).length === 1) {
            const posResult = view.posAtCoords({ x: event.clientX, y: event.clientY });
            const range = view.state.wordAt(posResult ?? selection.head);
            if (range) {
                from = range.from;
                to = range.to;
                word = view.state.sliceDoc(from, to).replace(/[^a-zA-Z']/g, '');
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
    function handleMetricsChange(m: Partial<EditorMetrics>) {
        updateMetrics(m);
    }
    function handleScrollChange(p: number, s: number, t: number) {
        updateScroll(tabId, p, s, t, 'editor');
    }
    function handleSelectionChange(a: number, h: number) {
        updateCursor(tabId, a, h);
    }
    function handleHistoryUpdate(state: unknown) {
        updateHistoryState(tabId, state);
    }

    function handleDictionaryUpdate() {
        if (cmView) {
            invalidateSpellcheckCache();
            triggerImmediateLint(cmView);
        }
    }

    let initialContent = $derived(activeTab?.content || '');
    let filename = $derived.by(() => {
        if (activeTab?.path) return activeTab.path;
        return activeTab?.preferredExtension === 'txt' ? 'unsaved.txt' : 'unsaved.md';
    });
    let isMarkdown = $derived.by(() => {
        if (activeTab?.preferredExtension) {
            return activeTab.preferredExtension === 'md';
        }
        return isMarkdownFile(filename);
    });
    let initialSelection = $derived(activeTab?.cursor || { anchor: 0, head: 0 });
    let initialHistoryState = $derived(activeTab ? getHistoryState(activeTab.id) : undefined);
    let lineChangeTracker = $derived(activeTab ? getLineChangeTracker(activeTab.id) : undefined);
    let showEmptyState = $derived(activeTab && !activeTab.path && activeTab.content.trim() === '');
</script>

<div class="bg-bg-main relative h-full w-full overflow-hidden">
    <EditorViewComponent
        bind:cmView
        {tabId}
        {initialContent}
        {isMarkdown}
        initialScrollTop={activeTab?.scrollTop || 0}
        {initialSelection}
        {initialHistoryState}
        {lineChangeTracker}
        customKeymap={spellCheckKeymap}
        {eventHandlers}
        onContentChange={handleContentChange}
        onMetricsChange={handleMetricsChange}
        onScrollChange={handleScrollChange}
        onSelectionChange={handleSelectionChange}
        onHistoryUpdate={handleHistoryUpdate} />
    {#if cmView}
        <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
    <FindReplacePanel
        bind:this={findReplacePanel}
        bind:isOpen={appContext.interface.showFind}
        {cmView} />

    {#if showEmptyState}
        <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <img
                src="/logo.svg"
                alt="MarkdownRS Logo"
                class="h-48 w-48 opacity-[0.08] select-none" />
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
        onDictionaryUpdate={handleDictionaryUpdate}
        onCut={() => {
            navigator.clipboard.writeText(contextSelectedText);
            if (!cmView) return;
            cmView.dispatch({
                changes: {
                    from: cmView.state.selection.main.from,
                    to: cmView.state.selection.main.to,
                    insert: '',
                },
            });
        }}
        onCopy={() => navigator.clipboard.writeText(contextSelectedText)}
        onPaste={async () => {
            if (!cmView) return;
            showContextMenu = false;
            cmView.focus();
            try {
                const text = await readText();
                if (typeof text === 'string' && text.length > 0) {
                    cmView.dispatch({
                        changes: {
                            from: cmView.state.selection.main.from,
                            to: cmView.state.selection.main.to,
                            insert: text,
                        },
                        selection: { anchor: cmView.state.selection.main.from + text.length },
                        scrollIntoView: true,
                    });
                } else if (text === null) {
                    AppError.info('UI:DragDrop', 'Clipboard content is not text', {
                        showToast: true,
                        userMessage: 'Clipboard does not contain valid text',
                    });
                }
            } catch (err) {
                AppError.handle('UI:DragDrop', err, {
                    showToast: true,
                    userMessage: 'Failed to paste from clipboard',
                    severity: 'error',
                });
            }
        }}
        onReplaceWord={(w) => {
            if (!cmView) return;
            cmView.dispatch({ changes: { from: contextWordFrom, to: contextWordTo, insert: w } });
            showContextMenu = false;
            setTimeout(() => {
                if (cmView) refreshSpellcheck(cmView);
            }, CONFIG.SPELLCHECK.REFRESH_DELAY_MS);
        }} />
{/if}
