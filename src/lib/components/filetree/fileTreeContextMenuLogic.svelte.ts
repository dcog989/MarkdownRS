import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { translate } from "$lib/i18n";
import { invalidateMetadataCache } from "$lib/services/fileMetadata";
import { fileWatcher } from "$lib/services/fileWatcher";
import { pruneBookmarksUnder } from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog, promptDialog } from "$lib/stores/dialogStore.svelte";
import { updateTabFields } from "$lib/stores/editorStore.svelte";
import { pruneFileHistoryUnder } from "$lib/stores/fileHistoryStore.svelte";
import { forgetSubtree, refreshDirectoryIfInTree } from "$lib/stores/fileTreeStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import type { FileEntry } from "$lib/types/api";
import { AppError } from "$lib/utils/errorHandling";
import { createDirOnDisk, createFileOnDisk, renameFileOnDisk, trashFileOnDisk } from "$lib/utils/fileIO";
import { openFile, renameFile, requestCloseTab } from "$lib/utils/fileSystem";
import { isValidFileName, resolveRenamedName } from "$lib/utils/fileValidation";
import { dirname } from "$lib/utils/path";

// Open tabs at or inside a renamed path keep the old path; rewrite it so the
// next save lands in the new location, and move the watchers along with them
// (they are keyed by path and would otherwise leak).
async function retargetTabs(oldPath: string, newPath: string): Promise<void> {
  const oldPrefix = `${oldPath}/`;
  const affected = appContext.editor.tabs.filter((t) => t.path === oldPath || t.path?.startsWith(oldPrefix));
  for (const tab of affected) {
    if (!tab.path) continue;
    const nextPath = tab.path === oldPath ? newPath : `${newPath}/${tab.path.slice(oldPrefix.length)}`;
    fileWatcher.unwatch(tab.id);
    updateTabFields(tab.id, { path: nextPath });
    await fileWatcher.watch(tab.id, nextPath);
  }
}

// Move a file or folder to another directory (drag and drop in the tree).
export async function moveEntry(oldPath: string, newPath: string): Promise<void> {
  if (!(await renameFileOnDisk(oldPath, newPath))) return;
  await retargetTabs(oldPath, newPath);
  forgetSubtree(oldPath);
  refreshDirectoryIfInTree(dirname(oldPath));
  refreshDirectoryIfInTree(dirname(newPath));
}

export class FileTreeContextMenuLogic {
  // Where "New File"/"New Folder" entries are created (a directory row itself,
  // or the parent of a file row, or the tree root for empty-space menus).
  directory = $state("");
  path = $state("");
  name = $state("");
  isDir = $state(false);
  onClose: () => void = () => {};

  constructor(directory: string, entry: FileEntry | null, onClose: () => void) {
    this.directory = directory;
    this.path = entry?.path ?? "";
    this.name = entry?.name ?? "";
    this.isDir = entry?.is_dir ?? false;
    this.onClose = onClose;
  }

  hasEntry = $derived(this.path !== "");

  handleNewFile = async (): Promise<void> => {
    const raw = await promptDialog({
      title: translate("fileTree.newFile"),
      message: translate("fileTree.newFileMessage"),
      value: "untitled.md",
    });
    if (!raw?.trim()) return;

    const clean = raw.trim();
    if (!isValidFileName(clean)) {
      showToast("error", translate("fileOps.invalidName"));
      return;
    }
    // Default to a markdown extension for extensionless names.
    const finalName = clean.includes(".") ? clean : `${clean}.md`;
    const newPath = `${this.directory}/${finalName}`;
    try {
      const created = await createFileOnDisk(newPath);
      if (created) {
        refreshDirectoryIfInTree(this.directory);
        void openFile(newPath);
      }
    } finally {
      this.onClose();
    }
  };

  handleNewFolder = async (): Promise<void> => {
    const raw = await promptDialog({
      title: translate("fileTree.newFolder"),
      message: translate("fileTree.newFolderMessage"),
      value: "New Folder",
    });
    if (!raw?.trim()) return;

    const clean = raw.trim();
    if (!isValidFileName(clean)) {
      showToast("error", translate("fileOps.invalidName"));
      return;
    }

    const newPath = `${this.directory}/${clean}`;
    try {
      const created = await createDirOnDisk(newPath);
      if (created) {
        refreshDirectoryIfInTree(this.directory);
      }
    } finally {
      this.onClose();
    }
  };

  handleOpen = (): void => {
    if (this.isDir) return;
    void openFile(this.path);
    this.onClose();
  };

  handleRename = async (): Promise<void> => {
    const raw = await promptDialog({
      title: translate("fileTree.rename"),
      message: translate("fileTree.renameMessage"),
      value: this.name,
    });
    if (!raw?.trim()) return;

    const clean = raw.trim();
    if (!isValidFileName(clean)) {
      showToast("error", translate("fileOps.invalidName"));
      this.onClose();
      return;
    }

    // `directory` is the folder itself for a folder row, so renaming must
    // target its parent (the same place the refresh below has to look).
    const parent = dirname(this.path);
    const tab = appContext.editor.tabs.find((t) => t.path === this.path);
    try {
      if (this.isDir) {
        const newPath = `${parent}/${clean}`;
        if (!(await renameFileOnDisk(this.path, newPath))) return;
        await retargetTabs(this.path, newPath);
        forgetSubtree(this.path);
      } else if (tab) {
        await renameFile(tab.id, clean);
      } else {
        const newPath = `${parent}/${resolveRenamedName(this.name, clean)}`;
        if (!(await renameFileOnDisk(this.path, newPath))) return;
      }
      refreshDirectoryIfInTree(parent);
    } catch (err) {
      AppError.handle("File:Write", err, {
        showToast: true,
        userMessage: translate("fileOps.failedRename"),
      });
    } finally {
      this.onClose();
    }
  };

  handleCopyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(this.path);
    } catch {
      // clipboard write failed
    } finally {
      this.onClose();
    }
  };

  handleRevealInFileManager = async (): Promise<void> => {
    try {
      await revealItemInDir(this.path);
    } catch {
      // reveal failed; nothing to report
    } finally {
      this.onClose();
    }
  };

  handleDelete = async (): Promise<void> => {
    const targetPath = this.path;
    const targetName = this.name;

    if (!appContext.settings.confirmationSuppressed) {
      const result = await confirmDialog({
        title: translate("tabContextMenu.deleteFileTitle"),
        message: translate("tabContextMenu.deleteFileMessage", { values: { title: targetName } }),
        discardLabel: translate("common.delete"),
        saveLabel: undefined,
      });
      if (result !== "discard") return;
    }

    const affected = appContext.editor.tabs.filter(
      (t) => t.path === targetPath || t.path?.startsWith(`${targetPath}/`),
    );

    try {
      // Close the tabs before trashing: the close prompt can be cancelled (or
      // its save can fail), and the file must not already be gone when it is.
      // requestCloseTab also drops each tab's watcher.
      for (const t of affected) {
        if (appContext.editor.tabs.some((tab) => tab.id === t.id)) {
          await requestCloseTab(t.id, true);
        }
      }
      const stillOpen = appContext.editor.tabs.some(
        (t) => t.path === targetPath || t.path?.startsWith(`${targetPath}/`),
      );
      if (stillOpen) return;

      if (!(await trashFileOnDisk(targetPath))) return;
      invalidateMetadataCache(targetPath);
      forgetSubtree(targetPath);
      refreshDirectoryIfInTree(dirname(targetPath));

      // Bookmark and history rows for the deleted path (or its children) now
      // point at nothing. Drop them so a click cannot open a dead path.
      await Promise.all([pruneBookmarksUnder(targetPath), pruneFileHistoryUnder(targetPath)]);
    } catch (err) {
      AppError.handle("File:Write", err, {
        showToast: true,
        userMessage: translate("fileOps.failedDelete"),
      });
    } finally {
      this.onClose();
    }
  };
}
