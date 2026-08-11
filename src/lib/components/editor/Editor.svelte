<script lang="ts">
import type { EditorView as CM6EditorView } from '@codemirror/view';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { onMount, tick, untrack } from 'svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import { createEditorEventHandlers } from '$lib/components/editor/codemirror/events';
import EditorViewComponent from '$lib/components/editor/EditorView.svelte';
import { performTextOperation } from '$lib/components/editor/logic/operations';
import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
import EditorContextMenu from '$lib/components/ui/EditorContextMenu.svelte';
import FindReplacePanel from '$lib/components/ui/FindReplacePanel.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import Minimap from '$lib/components/ui/Minimap.svelte';
import { translate } from '$lib/i18n';
import { type EditorMetrics, updateMetrics } from '$lib/stores/editorMetrics.svelte';
import {
  editorStore,
  getHistoryState,
  getLineChangeTracker,
  getTransientState,
  reopenClosedTab,
  tabsById,
  updateContent,
  updateCursor,
  updateHistoryState,
  updateScroll,
  updateTransientState,
} from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { CONFIG } from '$lib/utils/config';
import {
  registerEditorInstance,
  registerFlushFn,
  unregisterEditorInstance,
  unregisterFlushFn,
} from '$lib/utils/editorCommands';
import { AppError } from '$lib/utils/errorHandling';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { snapToMarkdownConstruct } from '$lib/utils/markdownExtensions';
import { searchState, updateSearchEditor } from '$lib/utils/searchManager.svelte';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import {
  invalidateSpellcheckCache,
  refreshSpellcheck,
  spellCheckKeymap,
  triggerImmediateLint,
} from '$lib/utils/spellcheckExtension.svelte';

let { tabId } = $props<{ tabId: string }>();

let cmView = $state<CM6EditorView & { getHistoryState?: () => unknown; flushPendingContent?: () => void }>();
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

let activeTab = $derived(tabsById().get(tabId));
let pendingTransform = $derived(editorStore.pendingTransform);

// Logic State
let previousTabId: string = '';

// Initialize Helpers
const eventHandlers = createEditorEventHandlers(onContextMenu);

onMount(() => {
  spellcheckState.init();

  // Register flush function for shutdown � must be inside onMount to guarantee cleanup pairing
  const flushFn = () => {
    if (cmView?.flushPendingContent) {
      cmView.flushPendingContent();
    }
  };
  registerFlushFn(flushFn);

  return () => {
    unregisterEditorInstance(tabId);
    unregisterFlushFn(flushFn);
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

$effect(() => {
  const tab = activeTab;
  if (!tab) return;
  if (tab.sizeBytes <= CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES) return;
  const ts = getTransientState(tab.id);
  if (ts?.forceFullFeatures) return;

  showToast('info', translate('editor.largeFileSimpleMode'), CONFIG.UI.TOAST_DURATION_MS, {
    label: translate('editor.enableFullFeatures'),
    onClick: () => {
      updateTransientState(tab.id, { forceFullFeatures: true });
      forceFullFeatures = true;
    },
  });
});

// Reactive Command Listener
$effect(() => {
  if (pendingTransform && pendingTransform.tabId === tabId && cmView) {
    const currentOp = pendingTransform.op;
    // Consume the command immediately so it doesn't re-run on tab switches or remounts
    editorStore.pendingTransform = null;

    untrack(() => {
      if (!cmView) return;
      performTextOperation(cmView, currentOp);
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

// Mirrors the rendered-mode Ctrl+C behavior (renderedCopyHandler) so context-menu
// copy/cut yield the same full raw construct (e.g. **bold**) instead of the bare
// visible text between hidden markers. Only applied when rendered decorations are active.
function getCopyRange(view: CM6EditorView, snap: boolean): { from: number; to: number } {
  const sel = view.state.selection.main;
  if (!snap) return { from: sel.from, to: sel.to };
  return snapToMarkdownConstruct(view, sel.from, sel.to);
}

function handleContentChange(c: string, lineCount: number) {
  updateContent(tabId, c, lineCount);
}
function handleMetricsChange(m: Partial<EditorMetrics>) {
  updateMetrics(m);
}
function handleScrollChange(p: number, s: number, t: number) {
  updateScroll(tabId, p, s, t);
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
let forceFullFeatures = $state(false);

$effect(() => {
  const ts = getTransientState(tabId);
  forceFullFeatures = ts?.forceFullFeatures ?? false;
});

let isLargeFile = $derived(
  !!activeTab && activeTab.sizeBytes > CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES && !forceFullFeatures,
);
// Mirrors EditorView's `effectiveMarkdown && rendered` gating of the rendered
// copy handler: snap to the full markdown construct only when the rendered
// decoration plugin is actually active.
let snapRenderedCopy = $derived(isMarkdown && !isLargeFile && appContext.settings.viewMode === 'rendered');
let showEmptyState = $derived(activeTab && !activeTab.path && activeTab.content.trim() === '');
</script>

<div
  class="bg-bg-main relative h-full w-full overflow-hidden"
  style:padding-right={appContext.settings.showMinimap ? '64px' : '0'}
>
  <EditorViewComponent
    bind:cmView
    {tabId}
    {initialContent}
    {isMarkdown}
    {isLargeFile}
    filePath={activeTab?.path ?? undefined}
    initialScrollTop={activeTab ? (getTransientState(activeTab.id)?.scrollTop ?? 0) : 0}
    initialTopLine={activeTab ? (getTransientState(activeTab.id)?.topLine ?? 0) : 0}
    {initialSelection}
    {initialHistoryState}
    {lineChangeTracker}
    customKeymap={spellCheckKeymap}
    {eventHandlers}
    {onContextMenu}
    onContentChange={handleContentChange}
    onMetricsChange={handleMetricsChange}
    onScrollChange={handleScrollChange}
    onSelectionChange={handleSelectionChange}
    onHistoryUpdate={handleHistoryUpdate}
  />
  {#if cmView}
    {#if appContext.settings.showMinimap}
      <Minimap view={cmView} />
    {:else}
      <CustomScrollbar viewport={cmView.scrollDOM} />
    {/if}
  {/if}
  <FindReplacePanel bind:this={findReplacePanel} bind:isOpen={appContext.interface.showFind} {cmView} />

  {#if showEmptyState}
    <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <Logo class="h-48 w-48 opacity-[0.08] select-none" />
    </div>
    {#if appContext.settings.enableClosedTabHistory && appContext.editor.closedTabsHistory.length > 0}
      <div
        class="pointer-events-none absolute inset-0 z-20 flex items-start justify-center"
        style="padding-top: 7.5rem"
      >
        <div
          class="bg-bg-panel border-border-light pointer-events-auto max-h-96 min-w-75 overflow-y-auto rounded-lg border shadow-xl"
        >
          <div class="text-fg-muted border-border-light border-b px-4 py-3 text-xs font-medium uppercase tracking-wide">
            {$_('editor.recentlyClosed')}
          </div>
          <div class="flex flex-col closed-tabs-list">
            {#each appContext.editor.closedTabsHistory.slice(0, 8) as entry, i (entry.tab.id)}
              <button
                type="button"
                onclick={() => reopenClosedTab(i)}
                use:tooltip={entry.tab.path || entry.tab.customTitle || entry.tab.title}
                class="hover:bg-bg-hover flex w-full items-center gap-3 border-b border-transparent px-4 py-2.5 text-left text-sm last:border-b-0 transition-colors"
              >
                <span class="text-fg-muted">•</span>
                <span class="truncate closed-tabs-text"
                  >{entry.tab.path || entry.tab.customTitle || entry.tab.title}</span
                >
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
.closed-tabs-list > button:nth-child(even) {
  background: var(--surface-row);
}
.closed-tabs-list > button:nth-child(even):hover {
  background: var(--surface-hover);
}
.closed-tabs-text {
  color: var(--accent-link);
}
.closed-tabs-list > button:hover .closed-tabs-text {
  color: var(--accent-link-hover);
}
</style>

{#if showContextMenu}
  <EditorContextMenu
    x={contextMenuX}
    y={contextMenuY}
    selectedText={contextSelectedText}
    wordUnderCursor={contextWordUnderCursor}
    onClose={() => (showContextMenu = false)}
    onDictionaryUpdate={handleDictionaryUpdate}
    onCut={() => {
            if (!cmView) return;
            const { from, to } = getCopyRange(cmView, snapRenderedCopy);
            navigator.clipboard.writeText(cmView.state.sliceDoc(from, to));
            cmView.dispatch({ changes: { from, to, insert: '' } });
        }}
    onCopy={() => {
            if (!cmView) return;
            const { from, to } = getCopyRange(cmView, snapRenderedCopy);
            navigator.clipboard.writeText(cmView.state.sliceDoc(from, to));
        }}
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
                    AppError.handle('UI:DragDrop', 'Clipboard content is not text', {
                        showToast: true,
                        userMessage: translate('editor.clipboardNoText'),
                        severity: 'info',
                    });
                }
            } catch (err) {
                AppError.handle('UI:DragDrop', err, {
                    showToast: true,
                    userMessage: translate('editor.pasteFailed'),
                    severity: 'error',
                });
            }
        }}
    onReplaceWord={(w) => {
            if (!cmView) return;
            cmView.dispatch({ changes: { from: contextWordFrom, to: contextWordTo, insert: w } });
            showContextMenu = false;
            // No delay needed: the dispatch applies synchronously and
            // refreshSpellcheck awaits the custom-dictionary reload before
            // re-linting, so the replaced word is settled by then.
            refreshSpellcheck(cmView);
        }}
  />
{/if}
