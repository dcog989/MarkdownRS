import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { editorStore, getTransientState, setFileCheckStatus } from "$lib/stores/editorStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { hashContent, isDirty } from "$lib/utils/contentHash";
import { AppError } from "$lib/utils/errorHandling";
import { checkAndReloadIfChanged, normalizeLineEndings, refreshMetadata, reloadFileContent } from "./fileMetadata";
import { fileWatcher } from "./fileWatcher";

/**
 * `diskContentVerified` means the caller just read this file from disk and
 * reconciled the tab against it (see `loadTabContentLazy`), so the change check
 * and the dirty-tab baseline read would only repeat that same I/O.
 * shortcut: an external write landing between that read and the watcher arming
 * is only noticed on the next change.
 */
export async function initializeTabFileState(tab: EditorTab, diskContentVerified = false): Promise<void> {
  if (!tab.path) {
    return;
  }

  // One read of the disk content per dirty episode: save and reload reset the
  // flag, and the watcher clears it when the file changes. Without this, every
  // switch re-read and re-hashed the whole file, clean or dirty.
  const baselineChecked = getTransientState(tab.id)?.fileCheckPerformed === true && !tab.fileCheckFailed;

  // One metadata read covers both existence and created/modified.
  if (!(await refreshMetadata(tab.id, tab.path))) {
    setFileCheckStatus(tab.id, true, true);
    return;
  }
  setFileCheckStatus(tab.id, true, false);

  if (!diskContentVerified) {
    if (!tab.isDirty && !baselineChecked) {
      const hasChanged = await checkAndReloadIfChanged(tab.id);
      if (hasChanged) {
        await reloadFileContent(tab.id);
      }
    }

    if (tab.isDirty && !baselineChecked) {
      try {
        const res = await callBackend("read_text_file", { path: tab.path }, "File:Read");

        if (!res) {
          throw new Error("Failed to read file: null result");
        }

        const storeTab = editorStore.tabs.find((x) => x.id === tab.id);
        if (storeTab) {
          const normalizedContent = normalizeLineEndings(res.content);
          storeTab.lastSavedHash = hashContent(normalizedContent);
          storeTab.isDirty = isDirty(storeTab.content, storeTab.lastSavedHash);
          storeTab.encoding = res.encoding.toUpperCase();
          storeTab.hasBom = res.has_bom;
        }
      } catch (err) {
        AppError.handle("File:Read", err, {
          showToast: false,
          severity: "warning",
          additionalInfo: { path: tab.path },
        });
      }
    }
  }

  try {
    await fileWatcher.watch(tab.id, tab.path);
  } catch (err) {
    AppError.handle("FileWatcher:Watch", err, {
      showToast: false,
      severity: "warning",
      additionalInfo: { path: tab.path },
    });
  }
}
