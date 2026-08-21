import { closeCompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { initializeTabFileState } from '$lib/services/tabFileStateInit';
import type { EditorMetrics } from '$lib/stores/editorMetrics.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { getHistoryState, getTransientState, updateContent, updateHistoryState } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import type { ScrollManager } from '$lib/utils/cmScroll';
import { restoreScrollByTopLine } from '$lib/utils/cmScroll';
import { CONFIG } from '$lib/utils/config';
import { setActiveEditorView } from '$lib/utils/editorCommands';
import { logger } from '$lib/utils/logger';
import { scrollSync } from '$lib/utils/scrollSync.svelte';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import { applyImmediateSpellcheck } from '$lib/utils/spellcheckExtension.svelte';
import { calculateCursorMetrics } from '$lib/utils/textMetrics';
import type { AppEditorView } from '../../../../global';

export class TabSyncManager {
  /** Shared mutable timer refs for both tab sync and the update listener */
  timerRefs = {
    content: null as number | null,
    metrics: null as number | null,
  };
  lastForceSyncCounter = 0;
  isRestoring = false;

  constructor(private scrollManager: ScrollManager) {}

  flushPending(
    view: AppEditorView,
    onContentChange: (c: string, l: number) => void,
    onHistoryUpdate?: (s: unknown) => void,
  ) {
    if (!this.timerRefs.content) return;
    clearTimeout(this.timerRefs.content);
    if (view._currentTabId) {
      updateContent(view._currentTabId, view.state.doc.toString(), view.state.doc.lines);
    } else {
      onContentChange(view.state.doc.toString(), view.state.doc.lines);
    }
    if (onHistoryUpdate && view.getHistoryState) {
      onHistoryUpdate(view.getHistoryState());
    }
  }

  process(
    view: AppEditorView,
    tabId: string,
    forceSyncCounter: number,
    createExtensions: (s: unknown) => Extension[],
    onMetricsChange: (m: Partial<EditorMetrics>) => void,
  ) {
    const storeTab = appContext.editor.tabs.find((t) => t.id === tabId);
    if (!storeTab) return;

    if (view._currentTabId !== tabId) {
      this.handleTabSwitch(view, tabId, storeTab, forceSyncCounter, createExtensions, onMetricsChange);
      return;
    }

    this.handleContentSync(view, tabId, storeTab, forceSyncCounter);
  }

  private handleTabSwitch(
    view: AppEditorView,
    tabId: string,
    storeTab: EditorTab,
    forceSyncCounter: number,
    createExtensions: (s: unknown) => Extension[],
    onMetricsChange: (m: Partial<EditorMetrics>) => void,
  ) {
    const totalStart = performance.now();
    const oldTabId = view._currentTabId;

    closeCompletion(view);

    // The editor and preview each restore their own saved scroll during a tab
    // switch; pause cross-pane syncing until the new tab's preview has rendered.
    scrollSync.beginTabSwitch();

    let saveOldMs = 0;
    if (this.timerRefs.content) {
      const s = performance.now();
      clearTimeout(this.timerRefs.content);
      this.timerRefs.content = null;
      if (oldTabId) {
        updateContent(oldTabId, view.state.doc.toString(), view.state.doc.lines);
      }
      saveOldMs = performance.now() - s;
    }
    if (this.timerRefs.metrics) {
      clearTimeout(this.timerRefs.metrics);
      this.timerRefs.metrics = null;
    }
    if (oldTabId && view.getHistoryState) {
      updateHistoryState(oldTabId, view.getHistoryState());
    }

    view._currentTabId = tabId;
    this.isRestoring = true;
    this.lastForceSyncCounter = forceSyncCounter;

    const storeContent = storeTab.content;
    const contentLen = storeContent.length;
    const restoredHistoryState = getHistoryState(tabId);

    const ecStart = performance.now();
    const newState = EditorState.create({
      doc: storeContent,
      extensions: createExtensions(restoredHistoryState),
      selection: {
        anchor: Math.min(storeTab.cursor.anchor, storeContent.length),
        head: Math.min(storeTab.cursor.head, storeContent.length),
      },
    });
    const stateCreateMs = performance.now() - ecStart;

    const vsStart = performance.now();
    view.setState(newState);
    const setStateMs = performance.now() - vsStart;

    const cursorStart = performance.now();
    const cursorPos = Math.min(storeTab.cursor.head, storeContent.length);
    const line = newState.doc.lineAt(cursorPos);
    onMetricsChange(
      calculateCursorMetrics(newState.doc, cursorPos, { number: line.number, from: line.from, text: line.text }),
    );
    const cursorMs = performance.now() - cursorStart;

    // Restore the scroll synchronously in the same task as `setState`, so the
    // browser paints the deep viewport already parsed and highlighted instead
    // of an un-styled frame while the parser catches up after a deferred measure.
    if (view && view._currentTabId === tabId) {
      const tabTs = getTransientState(tabId);
      restoreScrollByTopLine(view, tabTs?.topLine ?? 0, tabTs?.scrollTop ?? 0, tabTs?.scrollPercentage ?? 0);
    }

    view.focus();
    setActiveEditorView(view);

    const largeFileMode = storeTab.sizeBytes > CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES;

    if (!largeFileMode && spellcheckState.dictionaryLoaded) {
      applyImmediateSpellcheck(view);
    }

    if (!largeFileMode) {
      initializeTabFileState(storeTab).catch((err) => {
        logger.session.warn('TabInitFailed', { error: String(err) });
      });
    }

    setTimeout(() => {
      this.isRestoring = false;
    }, CONFIG.UI_TIMING.RESTORE_STATE_DELAY_MS);

    logger.editor.debug('TabSwitchTiming', {
      tabId,
      contentLen,
      sizeBytes: storeTab.sizeBytes,
      isLarge: largeFileMode,
      saveOldMs: Math.round(saveOldMs),
      stateCreateMs: Math.round(stateCreateMs),
      setStateMs: Math.round(setStateMs),
      cursorMs: Math.round(cursorMs),
      totalMs: Math.round(performance.now() - totalStart),
    });
  }

  private handleContentSync(view: AppEditorView, tabId: string, storeTab: EditorTab, forceSyncCounter: number) {
    const currentDoc = view.state.doc.toString();
    const storeContent = storeTab.content;
    const isLoaded = storeTab.contentLoaded;
    const isFocused = view.hasFocus;
    const isInitialPopulate = isLoaded && currentDoc === '' && storeContent !== '';
    const isForcedSync = forceSyncCounter > this.lastForceSyncCounter;

    const shouldSync =
      isInitialPopulate ||
      isForcedSync ||
      (!isFocused && currentDoc !== storeContent && !appContext.app.isTabSwitching);

    if (!shouldSync) return;

    const diff = computeContentDiff(currentDoc, storeContent);
    if (!diff) return;

    this.scrollManager.capture(view, 'Sync');
    view.dispatch({ changes: diff, userEvent: 'input.type.sync' });
    requestAnimationFrame(() => {
      if (view && view._currentTabId === tabId) {
        if (isInitialPopulate) {
          const tabTs = getTransientState(tabId);
          restoreScrollByTopLine(view, tabTs?.topLine ?? 0, tabTs?.scrollTop ?? 0, tabTs?.scrollPercentage ?? 0);
        } else {
          view.requestMeasure();
          this.scrollManager.restore(view, 'anchor');
        }
      }
    });

    if (isForcedSync) {
      this.lastForceSyncCounter = forceSyncCounter;
    }
  }

  cleanup() {
    if (this.timerRefs.content) clearTimeout(this.timerRefs.content);
    if (this.timerRefs.metrics) clearTimeout(this.timerRefs.metrics);
  }
}

function computeContentDiff(currentDoc: string, storeContent: string) {
  let from = 0;
  let to = currentDoc.length;
  let insert = storeContent;
  const minLen = Math.min(to, insert.length);

  let commonPrefix = 0;
  while (commonPrefix < minLen && currentDoc.charCodeAt(commonPrefix) === insert.charCodeAt(commonPrefix)) {
    commonPrefix++;
  }

  let commonSuffix = 0;
  const maxSuffix = minLen - commonPrefix;
  while (
    commonSuffix < maxSuffix &&
    currentDoc.charCodeAt(to - 1 - commonSuffix) === insert.charCodeAt(insert.length - 1 - commonSuffix)
  ) {
    commonSuffix++;
  }

  if (commonPrefix > 0 || commonSuffix > 0) {
    from = commonPrefix;
    to = to - commonSuffix;
    insert = insert.slice(commonPrefix, insert.length - commonSuffix);
  }

  return from !== to || insert.length > 0 ? { from, to, insert } : null;
}
