import { translate } from "$lib/i18n";
import {
  checkAndReloadIfChanged,
  checkFileExists,
  invalidateMetadataCache,
  refreshMetadata,
  reloadFileContent,
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
import { suspendTreeFollow } from "$lib/stores/fileTreeStore.svelte";
import { clearPaneTab, settlePanesAfterClose } from "$lib/stores/paneStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { runFlushFunctions } from "$lib/utils/editorCommands";
import { isValidFileName, resolveRenamedName } from "$lib/utils/fileValidation";
import { logger } from "$lib/utils/logger";
import { normalizePath } from "$lib/utils/path";
import { type CloseManyMode, selectTabsToClose } from "./closeTabs";
import { navigateToPath, openFile, saveCurrentFile, saveCurrentFileAs } from "./fileDialogs";
import { renameFileOnDisk } from "./fileIO";

export {
  checkAndReloadIfChanged,
  checkFileExists,
  loadSession,
  navigateToPath,
  openFile,
  persistSession,
  persistSessionDebounced,
  reloadFileContent,
  saveCurrentFile,
  saveCurrentFileAs,
};

export async function closeManyTabs(mode: CloseManyMode, tabId?: string): Promise<void> {
  for (const tab of selectTabsToClose(appContext.editor.tabs, mode, tabId)) {
    await requestCloseTab(tab.id, mode === "all");
  }
}

export async function withActiveTab<T>(tabId: string, operation: () => Promise<T>): Promise<T | undefined> {
  const prevActive = appContext.app.activeTabId;
  if (prevActive === tabId) {
    return operation();
  }
  // Swapping the active tab makes the file tree follow the saved document;
  // suppress that so saving a background tab cannot re-root and collapse it.
  // Pane layout is suspended too: activeTabId points at the saved tab only to
  // select it, and the visible panes must not re-key around it.
  return suspendTreeFollow(async () => {
    appContext.app.paneSyncSuspended = true;
    appContext.app.activeTabId = tabId;
    try {
      return await operation();
    } finally {
      // A background save must not undo a tab switch made while it ran.
      if (appContext.app.activeTabId === tabId) {
        appContext.app.activeTabId = prevActive;
      }
      appContext.app.paneSyncSuspended = false;
    }
  });
}

export async function saveAllFiles(): Promise<void> {
  const dirtyTabs = appContext.editor.tabs.filter((t) => t.isDirty && t.path);

  for (const tab of dirtyTabs) {
    await withActiveTab(tab.id, saveCurrentFile);
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
      fileWatcher.unwatch(tab.id);
    } catch {
      // Ignore errors when unwatching files that may not exist
    }
  }

  closeTab(id);
  clearPaneTab(id);

  if (appContext.app.activeTabId === id) {
    appContext.app.activeTabId = appContext.editor.mruStack[0] || null;
  }

  if (appContext.editor.tabs.length === 0) {
    const newId = await createNewFile();
    appContext.app.activeTabId = newId;
  }

  settlePanesAfterClose();
  persistSessionDebounced();
}

export async function triggerReopenClosedTab(historyIndex: number): Promise<void> {
  const reopenedTabId = await reopenClosedTab(historyIndex);
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
  if (!isValidFileName(cleanNewName)) {
    showToast("error", translate("fileOps.invalidName"));
    return false;
  }

  if (!tab.path) {
    updateTabTitle(tabId, cleanNewName, cleanNewName);
    return true;
  }

  try {
    const oldPath = normalizePath(tab.path);
    const pathParts = oldPath.split("/");
    const oldFileName = pathParts.pop() || "";
    const directory = pathParts.join("/");

    const finalNewName = resolveRenamedName(oldFileName, cleanNewName);

    const newPath = `${directory}/${finalNewName}`;

    if (oldPath === newPath) return true;

    const renamed = await renameFileOnDisk(oldPath, newPath);
    if (!renamed) return false;

    fileWatcher.unwatch(tabId);
    await fileWatcher.watch(tabId, newPath);
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

    return true;
  } catch (err) {
    logger.file.warn("RenameFailed", { error: String(err) });
    return false;
  }
}
