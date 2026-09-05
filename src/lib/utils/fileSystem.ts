import { translate } from "$lib/i18n";
import { addToDictionary } from "$lib/services/dictionaryService";
import {
  checkAndReloadIfChanged,
  checkFileExists,
  invalidateMetadataCache,
  refreshMetadata,
  reloadFileContent,
  sanitizePath,
} from "$lib/services/fileMetadata";
import { fileWatcher } from "$lib/services/fileWatcher";
import { loadSession, persistSession, persistSessionDebounced } from "$lib/services/sessionSerialization";
import { getBookmarkByPath, updateBookmark } from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog } from "$lib/stores/dialogStore.svelte";
import {
  closeTab,
  createNewFile,
  reopenClosedTab,
  updateTabFields,
  updateTabTitle,
} from "$lib/stores/editorStore.svelte";
import { addToFileHistory } from "$lib/stores/fileHistoryStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { runFlushFunctions } from "$lib/utils/editorCommands";
import { logger } from "$lib/utils/logger";
import {
  autoSaveCurrentFile,
  navigateToPath,
  openFile,
  openFileByPath,
  saveCurrentFile,
  saveCurrentFileAs,
} from "./fileDialogs";
import { renameFileOnDisk } from "./fileIO";

export {
  addToDictionary,
  autoSaveCurrentFile,
  checkAndReloadIfChanged,
  checkFileExists,
  loadSession,
  navigateToPath,
  openFile,
  openFileByPath,
  persistSession,
  persistSessionDebounced,
  reloadFileContent,
  saveCurrentFile,
  saveCurrentFileAs,
};

export type CloseManyMode = "right" | "left" | "others" | "saved" | "unsaved" | "all" | "unpinned";

export async function closeManyTabs(mode: CloseManyMode, tabId?: string): Promise<void> {
  const tabs = appContext.editor.tabs;
  const tabIndex = tabId != null ? tabs.findIndex((t) => t.id === tabId) : -1;

  let targets: (typeof tabs)[number][] = [];

  switch (mode) {
    case "right":
    case "left":
      // Right/left are relative to a specific tab. Without one, the -1 fallback
      // index would silently close the wrong tabs (slice(0) / slice(0, -1)).
      if (tabIndex === -1) return;
      targets = mode === "right" ? tabs.slice(tabIndex + 1) : tabs.slice(0, tabIndex);
      break;
    case "others":
      targets = tabs.filter((t) => t.id !== tabId);
      break;
    case "saved":
      targets = tabId != null ? tabs.filter((t) => !t.isDirty && t.id !== tabId) : tabs.filter((t) => !t.isDirty);
      break;
    case "unsaved":
      targets = tabId != null ? tabs.filter((t) => t.isDirty && t.id !== tabId) : tabs.filter((t) => t.isDirty);
      break;
    case "unpinned":
      targets = tabs.filter((t) => !t.isPinned);
      break;
    case "all":
      targets = tabs;
      break;
  }

  for (const t of targets) {
    if (t.isPinned && mode !== "all") continue;
    await requestCloseTab(t.id, mode === "all");
  }
}

export async function withActiveTab<T>(tabId: string, operation: () => Promise<T>): Promise<T | undefined> {
  const prevActive = appContext.app.activeTabId;
  if (prevActive === tabId) {
    return operation();
  }
  appContext.app.activeTabId = tabId;
  try {
    return await operation();
  } finally {
    appContext.app.activeTabId = prevActive;
  }
}

export async function requestCloseTab(id: string, force = false): Promise<void> {
  const tab = appContext.editor.tabs.find((t) => t.id === id);
  if (!tab || (tab.isPinned && !force)) return;

  // The editor syncs content into the store on a debounce (CONTENT_DEBOUNCE_MS);
  // a tab whose last edit is still pending would otherwise read as clean here
  // and close without the unsaved-changes prompt. Flush pending content first,
  // the same way saveCurrentFile does before writing.
  runFlushFunctions();

  if (!appContext.settings.confirmationSuppressed && tab.isDirty) {
    const result = await confirmDialog({
      title: translate("fileOps.closeDocumentTitle"),
      message: translate("fileOps.closeDocumentMessage", { values: { title: tab.title } }),
    });

    if (result === "cancel") return;
    if (result === "save") {
      const prev = appContext.app.activeTabId;
      appContext.app.activeTabId = id;
      if (!(await saveCurrentFile())) {
        appContext.app.activeTabId = prev;
        return;
      }
    }
  }

  if (tab.path) {
    addToFileHistory(tab.path);
    try {
      fileWatcher.unwatch(tab.path);
    } catch {
      // Ignore errors when unwatching files that may not exist
    }
  }

  closeTab(id);

  if (appContext.app.activeTabId === id) {
    appContext.app.activeTabId = appContext.editor.mruStack[0] || null;
  }

  if (appContext.editor.tabs.length === 0) {
    const newId = await createNewFile();
    appContext.app.activeTabId = newId;
  }

  persistSessionDebounced();
}

export function triggerReopenClosedTab(historyIndex: number): void {
  const reopenedTabId = reopenClosedTab(historyIndex);
  if (reopenedTabId) {
    appContext.app.activeTabId = reopenedTabId;
    persistSessionDebounced();
  }
}

export async function renameFile(tabId: string, newName: string): Promise<boolean> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab) return false;

  const cleanNewName = newName.trim();
  if (!cleanNewName) return false;

  if (!tab.path) {
    updateTabTitle(tabId, cleanNewName, cleanNewName);
    return true;
  }

  try {
    const oldPath = sanitizePath(tab.path);
    const pathParts = oldPath.split("/");
    const oldFileName = pathParts.pop() || "";
    const directory = pathParts.join("/");

    let finalNewName = cleanNewName;
    const oldExt = oldFileName.includes(".") ? oldFileName.split(".").pop() : "";
    const newExt = cleanNewName.includes(".") ? cleanNewName.split(".").pop() : "";

    if (oldExt && !newExt) {
      finalNewName = `${cleanNewName}.${oldExt}`;
    }

    const newPath = `${directory}/${finalNewName}`;

    if (oldPath === newPath) return true;

    const renamed = await renameFileOnDisk(oldPath, newPath);
    if (!renamed) return false;

    fileWatcher.unwatch(oldPath);
    await fileWatcher.watch(newPath);
    // rename() moves the inode; if another tab already watched newPath, that
    // watch is now on a replaced inode and must be re-armed.
    await fileWatcher.renew(newPath);

    updateTabFields(tabId, {
      path: newPath,
      title: finalNewName,
      customTitle: finalNewName,
    });

    invalidateMetadataCache(newPath);
    await refreshMetadata(tabId, newPath);

    addToFileHistory(newPath);

    const bookmark = getBookmarkByPath(oldPath);
    if (bookmark) {
      await updateBookmark(bookmark.id, finalNewName, bookmark.tags, newPath);
    }

    showToast("success", translate("fileOps.renamedTo", { values: { name: finalNewName } }));
    return true;
  } catch (err) {
    logger.file.warn("RenameFailed", { error: String(err) });
    return false;
  }
}
