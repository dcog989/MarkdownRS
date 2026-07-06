import { initializeTabLoadState } from '$lib/services/tabLoadStateMachine';
import { CONFIG } from '$lib/utils/config';
import { updateSavedHash } from '$lib/utils/contentHash';
import { formatTimestampForDisplay, getCurrentTimestamp } from '$lib/utils/date';
import { byteLength, computeLineStats } from '$lib/utils/textMetrics';
import { appState } from './appState.svelte';
import {
  clearTabCaches,
  computeWordCount,
  defaultTransientState,
  getHistoryState,
  getTransientState,
  initTabCaches,
  initTransientState,
  updateHistoryState,
} from './editorCache';
import { editorStore } from './editorStoreCore.svelte';
import type { ClosedTab, EditorTab } from './editorTypes';
import { settingsState } from './settingsState.svelte';

export function addTab(title: string = '', content: string = '') {
  const id = crypto.randomUUID();
  const now = getCurrentTimestamp();

  let finalTitle = title;
  const finalContent = content;

  if (!title || title === 'Untitled' || title === '') {
    const newTabPattern = /New-(\d+)/;
    let maxNewNumber = 0;
    for (const tab of editorStore.tabs) {
      const currentTitle = tab.customTitle || tab.title || '';
      const match = currentTitle.match(newTabPattern);
      if (match) maxNewNumber = Math.max(maxNewNumber, parseInt(match[1], 10));
    }
    finalTitle = `New-${maxNewNumber + 1}`;
  }

  const normalizedContent = finalContent.replace(/\r\n/g, '\n');
  const sizeBytes = byteLength(normalizedContent);

  let wordCount = 0;
  let lineCount = 1;
  let widestColumn = 0;

  if (normalizedContent.length > 0) {
    const stats = computeLineStats(normalizedContent);
    lineCount = stats.lineCount;
    widestColumn = stats.widestColumn;
    wordCount = computeWordCount(normalizedContent);
  }

  const newTab: EditorTab = {
    id,
    title: finalTitle,
    originalTitle: finalTitle,
    content: normalizedContent,
    lastSavedHash: '',
    isDirty: false,
    path: null,
    sizeBytes,
    wordCount,
    lineCount,
    widestColumn,
    cursor: { anchor: 0, head: 0 },
    created: now,
    modified: now,
    formattedTimestamp: formatTimestampForDisplay(now),
    lineEnding: 'LF',
    encoding: 'UTF-8',
    contentLoaded: true,
    wordCountPending: false,
  };

  updateSavedHash(newTab);
  initTabCaches(id);
  initializeTabLoadState(id, true);

  if (settingsState.newTabPosition === 'beginning') {
    editorStore.tabs.unshift(newTab);
  } else if (settingsState.newTabPosition === 'right' && appState.activeTabId) {
    const activeIndex = editorStore.tabs.findIndex((t) => t.id === appState.activeTabId);
    editorStore.tabs.splice(activeIndex + 1, 0, newTab);
  } else {
    editorStore.tabs.push(newTab);
  }

  pushToMru(id);
  editorStore.sessionDirty = true;
  return id;
}

export function closeTab(id: string) {
  const index = editorStore.tabs.findIndex((t) => t.id === id);
  if (index === -1) return;

  const tab = editorStore.tabs[index];

  if (tab.path || (tab.content && tab.content.trim().length > 0)) {
    const limit = CONFIG.EDITOR.CLOSED_TABS_HISTORY_LIMIT;
    const historyState = getHistoryState(id);

    const existingIndex = editorStore.closedTabsHistory.findIndex((entry) => entry.tab.id === tab.id);
    if (existingIndex !== -1) {
      editorStore.closedTabsHistory.splice(existingIndex, 1);
    }

    const closedTab: EditorTab = { ...tab };
    const closedEntry: ClosedTab = { tab: closedTab, index, historyState };

    editorStore.closedTabsHistory = [closedEntry, ...editorStore.closedTabsHistory].slice(0, limit);
  }

  editorStore.tabs = editorStore.tabs.filter((t) => t.id !== id);
  editorStore.mruStack = editorStore.mruStack.filter((tId) => tId !== id);

  clearTabCaches(id);

  editorStore.sessionDirty = true;
}

export function reopenClosedTab(historyIndex: number): string | null {
  if (historyIndex < 0 || historyIndex >= editorStore.closedTabsHistory.length) return null;

  const entry = editorStore.closedTabsHistory[historyIndex];
  editorStore.closedTabsHistory.splice(historyIndex, 1);

  const restoredTs = getTransientState(entry.tab.id) ?? defaultTransientState();
  restoredTs.contentChanged = true;
  restoredTs.isPersisted = false;
  initTransientState(entry.tab.id, restoredTs);
  if (entry.tab.contentLoaded === false) {
    entry.tab.contentLoaded = false;
  }

  if (entry.historyState) {
    updateHistoryState(entry.tab.id, entry.historyState);
  }

  const insertIndex = Math.min(entry.index, editorStore.tabs.length);
  editorStore.tabs.splice(insertIndex, 0, entry.tab);

  pushToMru(entry.tab.id);

  appState.activeTabId = entry.tab.id;

  editorStore.sessionDirty = true;
  return entry.tab.id;
}

export function pushToMru(id: string) {
  if (editorStore.mruStack.length > 0 && editorStore.mruStack[0] === id) return;
  editorStore.mruStack = [id, ...editorStore.mruStack.filter((tId) => tId !== id)];
  editorStore.sessionDirty = true;
}

export function reorderTabs(newTabs: EditorTab[]) {
  editorStore.tabs = newTabs;
}
