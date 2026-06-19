import { appState } from '$lib/stores/appState.svelte';
import { computeWordCount } from '$lib/stores/editorCache';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import {
  addTab,
  editorStore,
  getTransientState,
  initTransientState,
  markTabPersisted,
  setLineChangeTracker,
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
  created: string | null;
  modified: string | null;
  is_pinned: boolean;
  custom_title: string | null;
  file_check_failed?: boolean;
  file_check_performed?: boolean;
  mru_position?: number | null;
  sort_index?: number;
  original_index?: number | null;
};

let saveInProgress = false;

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
    const activeRustTabs: RustTabState[] = activeTabs.map((t, index) => {
      const ts = getTransientState(t.id);
      const needsContent = ts ? ts.contentChanged || !ts.isPersisted : true;

      return {
        id: t.id,
        path: t.path,
        title: t.title,
        content: needsContent ? t.content : null,
        is_dirty: t.isDirty,
        scroll_percentage: ts?.scrollPercentage ?? 0,
        created: t.created || null,
        modified: t.modified || null,
        is_pinned: t.isPinned || false,
        custom_title: t.customTitle || null,
        file_check_failed: t.fileCheckFailed || false,
        file_check_performed: ts?.fileCheckPerformed ?? false,
        mru_position: mruPositionMap.get(t.id) ?? null,
        sort_index: index,
        original_index: null,
      };
    });

    const closedTabs: RustTabState[] = editorStore.closedTabsHistory.map((entry, index) => {
      const ts = getTransientState(entry.tab.id);
      const needsContent = entry.tab.contentLoaded && (ts ? ts.contentChanged || !ts.isPersisted : true);

      return {
        id: entry.tab.id,
        path: entry.tab.path,
        title: entry.tab.title,
        content: needsContent ? entry.tab.content : null,
        is_dirty: entry.tab.isDirty,
        scroll_percentage: ts?.scrollPercentage ?? 0,
        created: entry.tab.created || null,
        modified: entry.tab.modified || null,
        is_pinned: entry.tab.isPinned || false,
        custom_title: entry.tab.customTitle || null,
        file_check_failed: entry.tab.fileCheckFailed || false,
        file_check_performed: ts?.fileCheckPerformed ?? false,
        mru_position: null,
        sort_index: index,
        original_index: entry.index,
      };
    });

    await callBackend('save_session', { activeTabs: activeRustTabs, closedTabs: closedTabs }, 'Session:Save');

    const tabsWithContent = activeRustTabs.filter((t) => t.content !== null).length;
    logger.session.info('SessionSaved', {
      duration: formatDuration(start),
      activeTabs: activeRustTabs.length,
      closedTabs: closedTabs.length,
      withContent: tabsWithContent,
    });

    editorStore.sessionDirty = false;

    activeTabs.forEach((t) => {
      markTabPersisted(t.id);
    });

    editorStore.closedTabsHistory.forEach((entry) => {
      updateTransientState(entry.tab.id, { contentChanged: false, isPersisted: true });
    });
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

  const wordCount = computeWordCount(content, sizeBytes);

  const editorTab: EditorTab = {
    id: t.id,
    title: t.title,
    originalTitle: t.title,
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
    lineEnding: (t.content && t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF') as 'LF' | 'CRLF',
    encoding: 'UTF-8',
    fileCheckFailed: t.file_check_failed || false,
    contentLoaded,
  };

  if (t.path) updateSavedHash(editorTab);

  setLineChangeTracker(t.id, new LineChangeTracker());
  initTransientState(
    t.id,
    {
      scrollPercentage: t.scroll_percentage,
      contentChanged: contentLoaded ? t.is_dirty || (!t.path && content.length > 0) : t.is_dirty,
      isPersisted: true,
      fileCheckPerformed: t.file_check_performed || false,
    },
    sizeBytes,
  );

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

      editorStore.tabs = convertedTabs;

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
