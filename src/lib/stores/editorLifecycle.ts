import { translate } from "$lib/i18n";
import { normalizeLineEndings, reloadFileContent } from "$lib/services/fileMetadata";
import { fileWatcher } from "$lib/services/fileWatcher";
import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { isTabDirty, updateSavedHash } from "$lib/utils/contentHash";
import { formatTimestampForDisplay, getCurrentDate, getCurrentTime, getCurrentTimestamp } from "$lib/utils/date";
import { readTextFile } from "$lib/utils/fileIO";
import { extractSmartTitle, getBaseTitle } from "$lib/utils/smartTitle";
import { byteLength, computeLineStats } from "$lib/utils/textMetrics";
import { appState } from "./appState.svelte";
import {
  clearTabCaches,
  computeWordCount,
  defaultTransientState,
  getHistoryState,
  getTransientState,
  initTabCaches,
  initTransientState,
  updateHistoryState,
} from "./editorCache";
import { editorStore, sortTabsPinnedFirst } from "./editorStoreCore.svelte";
import type { ClosedTab, EditorTab } from "./editorTypes";
import { settingsState } from "./settingsState.svelte";
import { showToast } from "./toastStore.svelte";

const TEMPLATE_DATE = "{{date}}";
const TEMPLATE_TIME = "{{time}}";

/** Expands the creation-time placeholders a new-file template may contain. */
function applyTemplatePlaceholders(content: string): string {
  if (!content.includes(TEMPLATE_DATE) && !content.includes(TEMPLATE_TIME)) return content;
  return content.replaceAll(TEMPLATE_DATE, getCurrentDate()).replaceAll(TEMPLATE_TIME, getCurrentTime());
}

export async function createNewFile(): Promise<string> {
  let content = "";
  const templatePath = settingsState.newFileTemplatePath;
  if (templatePath) {
    try {
      const result = await readTextFile(templatePath);
      content = applyTemplatePlaceholders(result?.content ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", translate("fileOps.failedReadTemplate", { values: { error: msg } }));
    }
  }
  return addTab("", content);
}

export function addTab(title: string = "", content: string = "") {
  const id = crypto.randomUUID();
  const now = getCurrentTimestamp();

  let finalTitle = title;

  if (!title || title === "Untitled") {
    const newTabPattern = /^New-(\d+)$/;
    let maxNewNumber = 0;
    for (const tab of editorStore.tabs) {
      const currentTitle = tab.customTitle || tab.title || "";
      const match = currentTitle.match(newTabPattern);
      if (match) maxNewNumber = Math.max(maxNewNumber, parseInt(match[1], 10));
    }
    finalTitle = `New-${maxNewNumber + 1}`;
  }

  const normalizedContent = content.replace(/\r\n/g, "\n");
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
    lastSavedHash: "",
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
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
    contentLoaded: true,
    wordCountPending: false,
  };

  updateSavedHash(newTab);
  // A new unsaved tab starts clean only if it has no content (e.g. an empty
  // template); any non-empty content must be treated as modified so closing
  // prompts for a save instead of silently discarding it.
  newTab.isDirty = isTabDirty(newTab);
  initTabCaches(id);

  if (settingsState.newTabPosition === "beginning") {
    editorStore.tabs.unshift(newTab);
  } else if (settingsState.newTabPosition === "right" && appState.activeTabId) {
    const activeIndex = editorStore.tabs.findIndex((t) => t.id === appState.activeTabId);
    // A stale active id (a tab closed earlier in a batch) would land at index 0.
    const insertIndex = activeIndex === -1 ? editorStore.tabs.length : activeIndex + 1;
    editorStore.tabs.splice(insertIndex, 0, newTab);
  } else {
    editorStore.tabs.push(newTab);
  }

  editorStore.tabs = sortTabsPinnedFirst(editorStore.tabs);
  pushToMru(id);
  editorStore.sessionDirty = true;
  return id;
}

export function closeTab(id: string) {
  const index = editorStore.tabs.findIndex((t) => t.id === id);
  if (index === -1) return;

  const tab = editorStore.tabs[index];
  const transient = getTransientState(id);
  let storedInHistory = false;

  if (settingsState.enableClosedTabHistory && (tab.path || (tab.content && tab.content.trim().length > 0))) {
    const limit = CONFIG.EDITOR.CLOSED_TABS_HISTORY_LIMIT;
    const historyState = getHistoryState(id);

    const existingIndex = editorStore.closedTabsHistory.findIndex((entry) => entry.tab.id === tab.id);
    if (existingIndex !== -1) {
      editorStore.closedTabsHistory.splice(existingIndex, 1);
    }

    // Large, clean, disk-backed files are re-readable from disk on reopen, so
    // don't hold their full content (and undo history built on that content)
    // in memory for the lifetime of the closed-tabs history.
    const canReloadFromDisk =
      !!tab.path && !tab.isDirty && tab.sizeBytes > CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES;

    const closedTab: EditorTab = canReloadFromDisk ? { ...tab, content: "", contentLoaded: false } : { ...tab };
    const closedEntry: ClosedTab = {
      tab: closedTab,
      index,
      historyState: canReloadFromDisk ? undefined : historyState,
    };

    const nextHistory = [closedEntry, ...editorStore.closedTabsHistory];
    for (const evicted of nextHistory.slice(limit)) {
      clearTabCaches(evicted.tab.id);
    }
    editorStore.closedTabsHistory = nextHistory.slice(0, limit);
    storedInHistory = true;
  }

  editorStore.tabs = editorStore.tabs.filter((t) => t.id !== id);
  editorStore.mruStack = editorStore.mruStack.filter((tId) => tId !== id);

  clearTabCaches(id);

  if (storedInHistory) {
    // Keep the small transient state for the history entry: the session save
    // reads it to know the closed content is already persisted. Without it,
    // every save rewrites the full text of every closed tab.
    initTransientState(id, transient ?? defaultTransientState());
  }

  editorStore.sessionDirty = true;
}

export async function reopenClosedTab(historyIndex: number): Promise<string | null> {
  if (historyIndex < 0 || historyIndex >= editorStore.closedTabsHistory.length) return null;

  const entry = editorStore.closedTabsHistory[historyIndex];

  // A restored history entry carries no text. Read it while the entry is still
  // in the history: inserting it first would let a session save create its
  // active row with NULL content and delete the closed row.
  if (entry.tab.contentLoaded === false && (entry.tab.isDirty || !entry.tab.path)) {
    const stored = await callBackend("load_tab_content", { tabId: entry.tab.id }, "Session:Load", undefined, {
      ignore: true,
    });
    if (stored && stored.content !== null) {
      const content = normalizeLineEndings(stored.content);
      const { lineCount, widestColumn } = computeLineStats(content);
      Object.assign(entry.tab, {
        content,
        contentLoaded: true,
        sizeBytes: byteLength(content),
        wordCount: computeWordCount(content),
        lineCount,
        widestColumn,
      });
    }
  }

  // The await above lets another close shift the list; find the entry again.
  const currentIndex = editorStore.closedTabsHistory.findIndex((e) => e.tab.id === entry.tab.id);
  if (currentIndex === -1) return null;
  editorStore.closedTabsHistory.splice(currentIndex, 1);

  const restoredTs = getTransientState(entry.tab.id) ?? defaultTransientState();
  restoredTs.contentChanged = true;
  restoredTs.isPersisted = false;
  initTransientState(entry.tab.id, restoredTs);
  const needsDiskReload = entry.tab.contentLoaded === false;

  // Closing cleared the pending count timer. Refresh it now so the reopened tab
  // does not show a stale, permanently dimmed count.
  if (entry.tab.contentLoaded && entry.tab.wordCountPending) {
    entry.tab.wordCount = computeWordCount(entry.tab.content);
    entry.tab.widestColumn = computeLineStats(entry.tab.content).widestColumn;
    entry.tab.wordCountPending = false;
  }

  // The stored title may have been content-derived under a setting that has
  // since changed; re-derive it from the current preference.
  if (!entry.tab.customTitle) {
    if (settingsState.tabNameFromContent) {
      const smartTitle = extractSmartTitle(entry.tab.content);
      if (smartTitle) entry.tab.title = smartTitle;
    } else {
      entry.tab.title = getBaseTitle(entry.tab);
    }
  }

  if (entry.historyState) {
    updateHistoryState(entry.tab.id, entry.historyState);
  }

  const insertIndex = Math.min(entry.index, editorStore.tabs.length);
  editorStore.tabs.splice(insertIndex, 0, entry.tab);

  editorStore.tabs = sortTabsPinnedFirst(editorStore.tabs);

  pushToMru(entry.tab.id);

  appState.activeTabId = entry.tab.id;

  editorStore.sessionDirty = true;

  if (entry.tab.path) {
    // requestCloseTab unwatched this path; re-arm so external edits are seen
    // again (the tab-switch hook skips large tabs).
    void fileWatcher.watch(entry.tab.id, entry.tab.path);
  }

  if (needsDiskReload) {
    // Content was dropped on close to save memory (see closeTab); pull it
    // back from disk now that the tab is active again.
    void reloadFileContent(entry.tab.id);
  }

  return entry.tab.id;
}

export function pushToMru(id: string) {
  if (editorStore.mruStack.length > 0 && editorStore.mruStack[0] === id) return;
  editorStore.mruStack = [id, ...editorStore.mruStack.filter((tId) => tId !== id)];
  editorStore.sessionDirty = true;
}

export function reorderTabs(newTabs: EditorTab[]) {
  editorStore.tabs = sortTabsPinnedFirst(newTabs);
  editorStore.sessionDirty = true;
}
