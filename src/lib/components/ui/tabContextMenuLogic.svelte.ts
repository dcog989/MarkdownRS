import { tick } from 'svelte';
import { exportService } from '$lib/services/exportService';
import { sanitizePath } from '$lib/services/fileMetadata';
import {
  addBookmark,
  deleteBookmark,
  getBookmarkByPath,
  isBookmarked as isBookmarkedSelector,
} from '$lib/stores/bookmarkStore.svelte';
import { confirmDialog } from '$lib/stores/dialogStore.svelte';
import { pushToMru, reorderTabs, togglePin, updateTabPath, updateTabTitle } from '$lib/stores/editorStore.svelte';
import type { EditorTab } from '$lib/stores/editorTypes';
import { triggerScrollToTab } from '$lib/stores/interfaceStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from '$lib/utils/backend';
import {
  requestCloseTab,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
  withActiveTab,
} from '$lib/utils/fileSystem';
import { shortcutManager } from '$lib/utils/shortcuts';

type CloseSubmenu = 'close' | 'export' | 'restore';

export class TabContextMenuLogic {
  tabId = $state('');
  onClose: () => void = () => {};

  constructor(tabId: string, onClose: () => void) {
    this.tabId = tabId;
    this.onClose = onClose;
  }

  activeSubmenu = $state<CloseSubmenu | null>(null);

  tab = $derived(appContext.editor.tabs.find((t) => t.id === this.tabId));
  isPinned = $derived(this.tab?.isPinned || false);
  isBookmarked = $derived(this.tab?.path ? isBookmarkedSelector(this.tab.path) : false);
  tabIndex = $derived(appContext.editor.tabs.findIndex((t) => t.id === this.tabId));

  hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty && t.id !== this.tabId));
  hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty && t.id !== this.tabId));
  hasCloseableTabsToRight = $derived(
    this.tabIndex < appContext.editor.tabs.length - 1 &&
      appContext.editor.tabs.slice(this.tabIndex + 1).some((t) => !t.isPinned),
  );
  hasCloseableTabsToLeft = $derived(
    this.tabIndex > 0 && appContext.editor.tabs.slice(0, this.tabIndex).some((t) => !t.isPinned),
  );
  hasCloseableOtherTabs = $derived(appContext.editor.tabs.some((t) => t.id !== this.tabId && !t.isPinned));

  totalTabs = $derived(appContext.editor.tabs.length);
  closedTabs = $derived(appContext.editor.closedTabsHistory);
  hasClosedTabs = $derived(appContext.editor.closedTabsHistory.length > 0);

  exportItems = $derived([
    { label: 'Export to HTML', handler: () => this.doExport(() => exportService.exportToHtml()) },
    { label: 'Export to PDF', handler: () => this.doExport(() => exportService.exportToPdf()) },
    { label: 'Export to PNG', handler: () => this.doExport(() => exportService.exportToImage('png')) },
    { label: 'Export to WEBP', handler: () => this.doExport(() => exportService.exportToImage('webp')) },
  ]);

  closeManyItems = $derived([
    { mode: 'right' as const, label: 'Close to the Right', disabled: !this.hasCloseableTabsToRight },
    { mode: 'left' as const, label: 'Close to the Left', disabled: !this.hasCloseableTabsToLeft },
    { mode: 'others' as const, label: 'Close Others', disabled: !this.hasCloseableOtherTabs },
    { mode: 'saved' as const, label: 'Close Saved', disabled: !this.hasSavedTabs },
    { mode: 'unsaved' as const, label: 'Close Not Saved', disabled: !this.hasUnsavedTabs },
    { mode: 'all' as const, label: 'Close All', disabled: false },
  ]);

  private async doExport(exportFn: () => Promise<void>) {
    if (appContext.app.activeTabId !== this.tabId) appContext.app.activeTabId = this.tabId;
    await exportFn();
    this.onClose();
  }

  async handleSave() {
    await withActiveTab(this.tabId, saveCurrentFile);
    this.onClose();
  }

  async handleSaveAs() {
    await withActiveTab(this.tabId, saveCurrentFileAs);
    this.onClose();
  }

  handlePin() {
    if (!this.tab) return;
    togglePin(this.tabId);
    this.onClose();
  }

  async handleCloseMany(mode: 'right' | 'left' | 'others' | 'saved' | 'unsaved' | 'all') {
    let targets: typeof appContext.editor.tabs = [];

    if (mode === 'right') targets = appContext.editor.tabs.slice(this.tabIndex + 1);
    else if (mode === 'left') targets = appContext.editor.tabs.slice(0, this.tabIndex);
    else if (mode === 'others') targets = appContext.editor.tabs.filter((t) => t.id !== this.tabId);
    else if (mode === 'saved') targets = appContext.editor.tabs.filter((t) => !t.isDirty && t.id !== this.tabId);
    else if (mode === 'unsaved') targets = appContext.editor.tabs.filter((t) => t.isDirty && t.id !== this.tabId);
    else if (mode === 'all') targets = appContext.editor.tabs;

    for (const t of targets.filter((t) => !t.isPinned)) {
      await requestCloseTab(t.id);
    }
    this.onClose();
  }

  async handleMoveTab(to: 'start' | 'end') {
    const newTabs = [...appContext.editor.tabs];
    const [tab] = newTabs.splice(this.tabIndex, 1);
    if (to === 'start') newTabs.unshift(tab);
    else newTabs.push(tab);
    reorderTabs(newTabs);
    appContext.editor.sessionDirty = true;
    appContext.app.activeTabId = this.tabId;
    pushToMru(this.tabId);
    await tick();
    triggerScrollToTab();
    this.onClose();
  }

  async handleRename() {
    if (!this.tab) return;

    if (!this.tab.path) {
      const newTitle = prompt('Enter new title:', this.tab.customTitle || this.tab.title);
      if (newTitle?.trim()) {
        updateTabTitle(this.tabId, newTitle.trim(), newTitle.trim());
      }
      this.onClose();
      return;
    }

    const oldPath = this.tab.path;
    const currentFileName = oldPath.split(/[\\/]/).pop() || '';
    const currentBaseName = currentFileName.replace(/\.md$/, '');
    const newFileName = prompt('Enter new file name (without .md):', currentBaseName);

    if (!newFileName?.trim() || newFileName.trim() === currentBaseName) {
      this.onClose();
      return;
    }

    const sanitizedName = newFileName.trim().replace(/[<>:"|?*]/g, '_');
    const newPath = sanitizePath(oldPath.replace(/[\\/][^\\/]+$/, `/${sanitizedName}.md`));

    try {
      const { fileWatcher } = await import('$lib/services/fileWatcher');
      const { invalidateMetadataCache } = await import('$lib/services/fileMetadata');

      fileWatcher.unwatch(oldPath);
      await callBackend('rename_file', { oldPath, newPath }, 'File:Write');
      invalidateMetadataCache(oldPath);
      invalidateMetadataCache(newPath);
      updateTabPath(this.tabId, newPath, `${sanitizedName}.md`);
      await fileWatcher.watch(newPath);

      for (const t of appContext.editor.tabs) {
        if (t.id !== this.tabId && t.path === oldPath) {
          updateTabPath(t.id, newPath, `${sanitizedName}.md`);
        }
      }

      if (this.isBookmarked) {
        const bookmark = getBookmarkByPath(oldPath);
        if (bookmark) {
          await deleteBookmark(bookmark.id);
          await addBookmark(newPath, `${sanitizedName}.md`, bookmark.tags);
        }
      }
    } catch (_err) {
    } finally {
      this.onClose();
    }
  }

  async handleSendToRecycleBin() {
    const targetPath = this.tab?.path;
    const targetTitle = this.tab?.title;
    const targetId = this.tabId;

    if (!targetPath) return;

    this.onClose();

    if (!appContext.app.confirmationSuppressed) {
      const result = await confirmDialog({
        title: 'Delete File',
        message: `Are you sure you want to move "${targetTitle}" to the Recycle Bin?`,
        discardLabel: 'Delete',
        saveLabel: undefined,
      });

      if (result !== 'discard') return;
    }

    try {
      const { fileWatcher } = await import('$lib/services/fileWatcher');
      const { invalidateMetadataCache } = await import('$lib/services/fileMetadata');

      fileWatcher.unwatch(targetPath);
      await callBackend('send_to_recycle_bin', { path: targetPath }, 'File:Write');
      invalidateMetadataCache(targetPath);
      await requestCloseTab(targetId, true);
    } catch (_err) {
      const { fileWatcher } = await import('$lib/services/fileWatcher');
      await fileWatcher.watch(targetPath);
    }
  }

  async handleToggleBookmark() {
    if (!this.tab?.path) return;
    try {
      if (this.isBookmarked) {
        const bookmark = getBookmarkByPath(this.tab.path);
        if (bookmark) await deleteBookmark(bookmark.id);
      } else {
        await addBookmark(this.tab.path, this.tab.title, []);
      }
    } finally {
      this.onClose();
    }
  }

  async handleReopenClosed(index: number) {
    triggerReopenClosedTab(index);
    this.onClose();
  }

  handleCopyTitle() {
    if (this.tab) navigator.clipboard.writeText(this.tab.title);
    this.onClose();
  }

  handleCopyPath() {
    if (this.tab?.path) navigator.clipboard.writeText(this.tab.path);
    this.onClose();
  }

  handleClose() {
    requestCloseTab(this.tabId);
    this.onClose();
  }

  getHistoryTooltip(tab: EditorTab): string {
    const lines = tab.content.slice(0, 300).split('\n').slice(0, 5);
    const preview = lines.join('\n') + (tab.content.length > 300 ? '...' : '');

    let title = tab.title;
    if (tab.path) title += `\n${tab.path}`;

    return `${title}\n\n-- Preview --\n${preview}`;
  }

  formatTitle(title: string): string {
    if (title.length > 20) return `${title.substring(0, 20)}...`;
    return title;
  }

  sc(commandId: string): string {
    return shortcutManager.getShortcutDisplay(commandId);
  }
}
