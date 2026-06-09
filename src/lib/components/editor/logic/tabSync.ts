import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { initializeTabFileState } from '$lib/services/sessionPersistence';
import type { EditorMetrics } from '$lib/stores/editorMetrics.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { getHistoryState, getTransientState, updateContent, updateHistoryState } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import type { ScrollManager } from '$lib/utils/cmScroll';
import { CONFIG } from '$lib/utils/config';
import { setActiveEditorView } from '$lib/utils/editorCommands';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import { applyImmediateSpellcheck } from '$lib/utils/spellcheckExtension.svelte.ts';
import { calculateCursorMetrics } from '$lib/utils/textMetrics';
import type { AppEditorView } from '../../../../global';

export class TabSyncManager {
  /** Shared mutable timer refs for both tab sync and the update listener */
  timerRefs = {
    content: null as number | null,
    metrics: null as number | null,
    cursor: null as number | null,
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
    const oldTabId = view._currentTabId;

    if (this.timerRefs.content) {
      clearTimeout(this.timerRefs.content);
      this.timerRefs.content = null;
      if (oldTabId) {
        updateContent(oldTabId, view.state.doc.toString(), view.state.doc.lines);
      }
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
    const restoredHistoryState = getHistoryState(tabId);

    const newState = EditorState.create({
      doc: storeContent,
      extensions: createExtensions(restoredHistoryState),
      selection: {
        anchor: Math.min(storeTab.cursor.anchor, storeContent.length),
        head: Math.min(storeTab.cursor.head, storeContent.length),
      },
    });

    view.setState(newState);

    const cursorPos = Math.min(storeTab.cursor.head, storeContent.length);
    const line = newState.doc.lineAt(cursorPos);
    onMetricsChange(
      calculateCursorMetrics(storeContent, cursorPos, { number: line.number, from: line.from, text: line.text }),
    );

    view.requestMeasure({
      read: () => {},
      write: () => {
        if (view && view._currentTabId === tabId) {
          const tabTs = getTransientState(tabId);
          const savedTopLine = tabTs?.topLine ?? 0;
          const savedScrollTop = tabTs?.scrollTop ?? 0;
          if (savedTopLine > 1) {
            try {
              const safeLine = Math.max(1, Math.min(savedTopLine, newState.doc.lines));
              const lineInfo = newState.doc.line(safeLine);
              view.dispatch({ effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }) });
            } catch {
              view.scrollDOM.scrollTop = savedScrollTop;
            }
          } else {
            view.scrollDOM.scrollTop = savedScrollTop;
          }
        }
      },
    });

    view.focus();
    setActiveEditorView(view);

    if (spellcheckState.dictionaryLoaded) {
      applyImmediateSpellcheck(view);
    }

    initializeTabFileState(storeTab).catch((err) => {
      console.warn('[TabSync] Failed to initialize tab file state:', err);
    });

    setTimeout(() => {
      this.isRestoring = false;
    }, CONFIG.UI_TIMING.RESTORE_STATE_DELAY_MS);
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
        view.requestMeasure();
        this.scrollManager.restore(view, 'anchor');
      }
    });

    if (isForcedSync) {
      this.lastForceSyncCounter = forceSyncCounter;
    }
  }

  cleanup() {
    if (this.timerRefs.content) clearTimeout(this.timerRefs.content);
    if (this.timerRefs.metrics) clearTimeout(this.timerRefs.metrics);
    if (this.timerRefs.cursor) clearTimeout(this.timerRefs.cursor);
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
