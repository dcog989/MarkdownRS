import { appState } from '$lib/stores/appState.svelte';
import { computeWordCount } from '$lib/stores/editorCache';
import type { EditorTab, TabTransientState } from '$lib/stores/editorStore.svelte';
import {
  addTab,
  editorStore,
  getTransientState,
  initTransientState,
  markTabPersisted,
  setLineChangeTracker,
  sortTabsPinnedFirst,
  updateTransientState,
} from '$lib/stores/editorStore.svelte';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { updateSavedHash } from '$lib/utils/contentHash';
import { formatTimestampForDisplay } from '$lib/utils/date';
import { AppError } from '$lib/utils/errorHandling';
import { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { logger } from '$lib/utils/logger';
import { extractSmartTitle, getBaseTitle } from '$lib/utils/smartTitle';
import { byteLength, computeLineStats } from '$lib/utils/textMetrics';
import { debounce, formatDuration } from '$lib/utils/timing';
import { normalizeLineEndings } from './fileMetadata';
import { initializeTabFileState } from './tabFileStateInit';
import { initializeTabLoadState, loadTabContentLazy } from './tabLoadStateMachine';

type RustTabState = {
  id: string;
  title: string;
  content: string | null;
  is_dirty: boolean;
  path: string | null;
  scroll_percentage: number;
  scroll_top: number;
  top_line: number;
  created: string | null;
  modified: string | null;
  is_pinned: boolean;
  custom_title: string | null;
  file_check_failed?: boolean;
  file_check_performed?: boolean;
  mru_position?: number | null;
  sort_index?: number;
  original_index?: number | null;
  line_ending?: string | null;
  encoding?: string | null;
  has_bom?: boolean;
};

let saveInProgress = false;

/** Large, clean, disk-backed files are re-read from disk on restore, so skip
 *  writing their content into the session DB on every save (dirty ones must
 *  still persist, or their unsaved edits would be lost). */
function shouldSkipContent(tab: EditorTab): boolean {
  return !!tab.path && !tab.isDirty && tab.sizeBytes > CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES;
}

function toRustTabState(
  tab: EditorTab,
  ts: TabTransientState | undefined,
  index: number,
  needsContent: boolean,
  mruPosition: number | null,
  originalIndex: number | null = null,
): RustTabState {
  return {
    id: tab.id,
    path: tab.path,
    title: tab.title,
    content: needsContent && !shouldSkipContent(tab) ? tab.content : null,
    is_dirty: tab.isDirty,
    scroll_percentage: ts?.scrollPercentage ?? 0,
    scroll_top: ts?.scrollTop ?? 0,
    top_line: ts?.topLine ?? 1,
    created: tab.created || null,
    modified: tab.modified || null,
    is_pinned: tab.isPinned || false,
    custom_title: tab.customTitle || null,
    file_check_failed: tab.fileCheckFailed || false,
    file_check_performed: ts?.fileCheckPerformed ?? false,
    mru_position: mruPosition,
    sort_index: index,
    original_index: originalIndex,
    line_ending: tab.lineEnding,
    encoding: tab.encoding,
    has_bom: tab.hasBom,
  };
}

export async function persistSession(): Promise<void> {
  if (!editorStore.sessionDirty || saveInProgress) {
    return;
  }

  saveInProgress = true;
  const start = performance.now();

  try {
    const mruPositionMap = new Map<string, number>();
    for (const [index, tabId] of editorStore.mruStack.entries()) {
      mruPositionMap.set(tabId, index);
    }

    const activeTabs = editorStore.tabs;
    const snapshots = activeTabs.map((t, index) => {
      const ts = getTransientState(t.id);
      // Content is only authoritative once a tab is loaded into memory. Tabs
      // restored from the session DB start with a '' placeholder and
      // contentLoaded=false; writing that placeholder would erase the stored
      // content of dirty unsaved tabs that haven't been lazily loaded yet.
      const needsContent = (t.contentLoaded ?? false) && (ts ? ts.contentChanged || !ts.isPersisted : true);
      return {
        id: t.id,
        wasChanged: ts?.contentChanged ?? false,
        saved: toRustTabState(t, ts, index, needsContent, mruPositionMap.get(t.id) ?? null),
      };
    });
    const activeRustTabs = snapshots.map((s) => s.saved);

    const closedTabs: RustTabState[] = editorStore.closedTabsHistory.map((entry, index) => {
      const ts = getTransientState(entry.tab.id);
      const needsContent = (entry.tab.contentLoaded ?? false) && (ts ? ts.contentChanged || !ts.isPersisted : true);
      return toRustTabState(entry.tab, ts, index, needsContent, null, entry.index);
    });

    await callBackend('save_session', { activeTabs: activeRustTabs, closedTabs: closedTabs }, 'Session:Save');

    const tabsWithContent = activeRustTabs.filter((t) => t.content !== null).length;
    logger.session.info('SessionSaved', {
      duration: formatDuration(start),
      activeTabs: activeRustTabs.length,
      closedTabs: closedTabs.length,
      withContent: tabsWithContent,
    });

    // Only mark a tab persisted if the saved snapshot still matches its live
    // state. Edits that landed while the write was in flight keep the tab (and
    // session) dirty so the next persist re-saves them instead of dropping
    // them (the old code unconditionally reset contentChanged after the await).
    let anyUnpersisted = false;
    for (const s of snapshots) {
      const current = editorStore.tabs.find((t) => t.id === s.id);
      if (!current) continue;

      let editedDuringSave: boolean;
      if (s.saved.content !== null) {
        editedDuringSave = current.content !== s.saved.content;
      } else {
        // Content wasn't sent (clean or unloaded tab), so the DB kept its
        // previous value; only a clean->dirty transition during the save needs
        // another round.
        const ts = getTransientState(s.id);
        editedDuringSave = (ts?.contentChanged ?? false) && !s.wasChanged;
      }

      if (editedDuringSave) {
        anyUnpersisted = true;
      } else {
        markTabPersisted(s.id);
      }
    }

    editorStore.closedTabsHistory.forEach((entry) => {
      updateTransientState(entry.tab.id, { contentChanged: false, isPersisted: true });
    });

    editorStore.sessionDirty = anyUnpersisted;
  } catch (err) {
    editorStore.sessionDirty = true;
    AppError.handle('Session:Save', err, {
      showToast: false,
      severity: 'warning',
    });
  } finally {
    saveInProgress = false;
  }
}

function convertRustTabToEditorTab(t: RustTabState, contentLoaded: boolean = true): EditorTab {
  const rawContent = t.content || '';
  const content = normalizeLineEndings(rawContent);
  const timestamp = t.modified || t.created || '';

  const sizeBytes = byteLength(content);

  const { lineCount, widestColumn } = computeLineStats(content);

  const wordCount = computeWordCount(content);

  // The persisted title may have been content-derived under a previous session
  // where content-naming was enabled. File-backed tabs are re-titled from their
  // path, so the title is never stale after the setting is turned off.
  const baseTitle = getBaseTitle({ path: t.path, title: t.title, originalTitle: t.title });

  let title = t.title;
  if (!t.custom_title) {
    if (settingsState.tabNameFromContent) {
      const smartTitle = extractSmartTitle(content);
      if (smartTitle) title = smartTitle;
    } else if (t.path) {
      title = baseTitle;
    }
  }

  const editorTab: EditorTab = {
    id: t.id,
    title,
    originalTitle: baseTitle,
    content,
    lastSavedHash: '',
    isDirty: t.is_dirty,
    path: t.path,
    sizeBytes,
    wordCount,
    lineCount,
    widestColumn,
    cursor: { anchor: 0, head: 0 },
    created: t.created || undefined,
    modified: t.modified || undefined,
    formattedTimestamp: formatTimestampForDisplay(timestamp),
    isPinned: t.is_pinned,
    customTitle: t.custom_title || undefined,
    lineEnding: t.line_ending === 'CRLF' ? 'CRLF' : 'LF',
    encoding: t.encoding ? t.encoding.toUpperCase() : 'UTF-8',
    hasBom: t.has_bom || false,
    fileCheckFailed: t.file_check_failed || false,
    contentLoaded,
  };

  if (t.path) updateSavedHash(editorTab);

  // An unsaved restored tab has no on-disk baseline, so it is modified
  // whenever it holds content. The persisted is_dirty flag can be stale
  // (e.g. a template-backed new file persisted while still marked clean) and
  // would otherwise let Ctrl+W discard the content without a save prompt.
  if (!t.path && editorTab.content.trim().length > 0) {
    editorTab.isDirty = true;
  }

  setLineChangeTracker(t.id, new LineChangeTracker());
  initTransientState(t.id, {
    scrollPercentage: t.scroll_percentage,
    scrollTop: t.scroll_top,
    topLine: t.top_line,
    contentChanged: contentLoaded ? t.is_dirty || (!t.path && content.length > 0) : t.is_dirty,
    isPersisted: true,
    fileCheckPerformed: t.file_check_performed || false,
  });

  return editorTab;
}

export async function loadSession(): Promise<void> {
  const start = performance.now();

  try {
    const sessionData = await callBackend('restore_session', {}, 'Session:Load');

    let activeRustTabs: RustTabState[] = [];
    let closedRustTabs: RustTabState[] = [];

    if (Array.isArray(sessionData)) {
      activeRustTabs = sessionData as RustTabState[];
    } else if (sessionData && typeof sessionData === 'object') {
      const sd = sessionData as { active_tabs?: unknown[]; closed_tabs?: unknown[] };
      activeRustTabs = (sd.active_tabs || []) as RustTabState[];
      closedRustTabs = (sd.closed_tabs || []) as RustTabState[];
    }

    if (activeRustTabs.length > 0) {
      activeRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

      const convertedTabs: EditorTab[] = activeRustTabs.map((t) => {
        const tab = convertRustTabToEditorTab(t, false);
        return tab;
      });

      editorStore.tabs = sortTabsPinnedFirst(convertedTabs);

      convertedTabs.forEach((tab) => {
        initializeTabLoadState(tab.id, false);
      });

      const sortedMru = activeRustTabs
        .filter((t) => t.mru_position !== null && t.mru_position !== undefined)
        .sort((a, b) => (a.mru_position || 0) - (b.mru_position || 0))
        .map((t) => t.id);

      editorStore.mruStack = sortedMru.length > 0 ? sortedMru : convertedTabs.map((t) => t.id);

      switch (settingsState.startupBehavior) {
        case 'first':
          appState.activeTabId = convertedTabs[0].id;

          break;
        case 'last-focused':
          appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id;

          break;
        case 'new':
          break;
        default:
          appState.activeTabId = convertedTabs[0].id;
      }

      const activeTab = editorStore.tabs.find((t) => t.id === appState.activeTabId);
      if (activeTab) {
        await loadTabContentLazy(activeTab.id);
        await initializeTabFileState(activeTab);
      }
    }

    if (editorStore.tabs.length === 0 || settingsState.startupBehavior === 'new') {
      if (settingsState.startupBehavior === 'new' && activeRustTabs.length > 0) {
        appState.activeTabId = addTab();
      } else if (editorStore.tabs.length === 0) {
        appState.activeTabId = addTab();
      }
    }

    if (closedRustTabs.length > 0) {
      closedRustTabs.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

      editorStore.closedTabsHistory = closedRustTabs.map((t) => {
        const tab = convertRustTabToEditorTab(t, false);
        initializeTabLoadState(tab.id, false);

        return {
          tab,
          index: t.original_index ?? 0,
        };
      });
    }

    const hasUnsavedTabsWithContent = editorStore.tabs.some((t) => !t.path && t.content.length > 0);
    editorStore.sessionDirty = hasUnsavedTabsWithContent;

    logger.session.info('SessionLoaded', {
      duration: formatDuration(start),
      activeTabs: editorStore.tabs.length,
      closedTabs: editorStore.closedTabsHistory.length,
    });
  } catch (err) {
    AppError.handle('Session:Load', err, {
      showToast: false,
      severity: 'warning',
    });

    appState.activeTabId = addTab();
  }
}

export const persistSessionDebounced = debounce(persistSession, CONFIG.SESSION.SAVE_DEBOUNCE_MS);
