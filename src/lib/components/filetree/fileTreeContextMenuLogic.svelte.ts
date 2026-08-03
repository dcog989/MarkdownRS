import { translate } from '$lib/i18n';
import { invalidateMetadataCache } from '$lib/services/fileMetadata';
import { fileWatcher } from '$lib/services/fileWatcher';
import { confirmDialog, promptDialog } from '$lib/stores/dialogStore.svelte';
import { dirname, refreshDirectoryIfInTree } from '$lib/stores/fileTreeStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import type { FileEntry } from '$lib/types/api';
import { callBackend } from '$lib/utils/backend';
import { createDirOnDisk, createFileOnDisk } from '$lib/utils/fileIO';
import { openFile, renameFile, requestCloseTab } from '$lib/utils/fileSystem';

export class FileTreeContextMenuLogic {
  // Where "New File"/"New Folder" entries are created (a directory row itself,
  // or the parent of a file row, or the tree root for empty-space menus).
  directory = $state('');
  path = $state('');
  name = $state('');
  isDir = $state(false);
  onClose: () => void = () => {};

  constructor(directory: string, entry: FileEntry | null, onClose: () => void) {
    this.directory = directory;
    this.path = entry?.path ?? '';
    this.name = entry?.name ?? '';
    this.isDir = entry?.is_dir ?? false;
    this.onClose = onClose;
  }

  hasEntry = $derived(this.path !== '');

  handleNewFile = async (): Promise<void> => {
    const raw = await promptDialog({
      title: translate('fileTree.newFile'),
      message: translate('fileTree.newFileMessage'),
      value: 'untitled.md',
    });
    if (!raw?.trim()) return;

    const clean = raw.trim();
    // Default to a markdown extension for extensionless names.
    const finalName = clean.includes('.') ? clean : `${clean}.md`;
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
      title: translate('fileTree.newFolder'),
      message: translate('fileTree.newFolderMessage'),
      value: 'New Folder',
    });
    if (!raw?.trim()) return;

    const newPath = `${this.directory}/${raw.trim()}`;
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
      title: translate('fileTree.rename'),
      message: translate('fileTree.renameMessage'),
      value: this.name,
    });
    if (!raw?.trim()) return;

    const clean = raw.trim();
    const tab = appContext.editor.tabs.find((t) => t.path === this.path);
    try {
      if (tab) {
        await renameFile(tab.id, clean);
      } else {
        await callBackend('rename_file', { oldPath: this.path, newPath: `${this.directory}/${clean}` }, 'File:Write');
      }
      refreshDirectoryIfInTree(this.directory);
    } catch {
      // rename failed; the error has already been reported
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

  handleDelete = async (): Promise<void> => {
    const targetPath = this.path;
    const targetName = this.name;

    if (!appContext.settings.confirmationSuppressed) {
      const result = await confirmDialog({
        title: translate('tabContextMenu.deleteFileTitle'),
        message: translate('tabContextMenu.deleteFileMessage', { values: { title: targetName } }),
        discardLabel: translate('common.delete'),
        saveLabel: undefined,
      });
      if (result !== 'discard') return;
    }

    try {
      const tab = appContext.editor.tabs.find((t) => t.path === targetPath);
      if (tab) {
        fileWatcher.unwatch(targetPath);
      }

      await callBackend('send_to_recycle_bin', { path: targetPath }, 'File:Write');
      invalidateMetadataCache(targetPath);

      if (tab) {
        await requestCloseTab(tab.id, true);
      }
      refreshDirectoryIfInTree(dirname(targetPath));
    } catch (_err) {
      const tab = appContext.editor.tabs.find((t) => t.path === targetPath);
      if (tab) await fileWatcher.watch(targetPath);
    } finally {
      this.onClose();
    }
  };
}
