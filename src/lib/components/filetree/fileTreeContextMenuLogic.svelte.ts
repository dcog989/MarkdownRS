import { translate } from '$lib/i18n';
import { invalidateMetadataCache } from '$lib/services/fileMetadata';
import { fileWatcher } from '$lib/services/fileWatcher';
import { confirmDialog, promptDialog } from '$lib/stores/dialogStore.svelte';
import { dirname, refreshDirectoryIfInTree } from '$lib/stores/fileTreeStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { callBackend } from '$lib/utils/backend';
import { openFile, renameFile, requestCloseTab } from '$lib/utils/fileSystem';

export class FileTreeContextMenuLogic {
  path = $state('');
  name = $state('');
  isDir = $state(false);
  onClose: () => void = () => {};

  constructor(path: string, name: string, isDir: boolean, onClose: () => void) {
    this.path = path;
    this.name = name;
    this.isDir = isDir;
    this.onClose = onClose;
  }

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
    const directory = dirname(this.path);
    const tab = appContext.editor.tabs.find((t) => t.path === this.path);
    try {
      if (tab) {
        await renameFile(tab.id, clean);
      } else {
        await callBackend('rename_file', { oldPath: this.path, newPath: `${directory}/${clean}` }, 'File:Write');
      }
      refreshDirectoryIfInTree(directory);
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
