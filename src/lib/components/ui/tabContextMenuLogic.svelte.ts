import { tick } from 'svelte';
import { translate } from '$lib/i18n';
import { exportService } from '$lib/services/exportService';
import {
  addBookmark,
  deleteBookmark,
  getBookmarkByPath,
  isBookmarked as isBookmarkedSelector,
} from '$lib/stores/bookmarkStore.svelte';
import { confirmDialog, promptDialog } from '$lib/stores/dialogStore.svelte';
import { pushToMru, reorderTabs, togglePin, updateTabTitle } from '$lib/stores/editorStore.svelte';
import type { EditorTab } from '$lib/stores/editorTypes';
import { triggerScrollToTab } from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { callBackend } from '$lib/utils/backend';
import {
  closeManyTabs,
  renameFile,
  requestCloseTab,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
  withActiveTab,
} from '$lib/utils/fileSystem';
import { getFilename } from '$lib/utils/fileValidation';
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
    {
      label: translate('tabContextMenu.exportToHtml'),
      handler: () => this.doExport(() => exportService.exportToHtml()),
    },
    { label: translate('tabContextMenu.exportToPdf'), handler: () => this.doExport(() => exportService.exportToPdf()) },
    {
      label: translate('tabContextMenu.exportToPng'),
      handler: () => this.doExport(() => exportService.exportToImage('png')),
    },
    {
      label: translate('tabContextMenu.exportToWebp'),
      handler: () => this.doExport(() => exportService.exportToImage('webp')),
    },
  ]);

  closeManyItems = $derived([
    {
      mode: 'right' as const,
      label: translate('tabContextMenu.closeToTheRight'),
      disabled: !this.hasCloseableTabsToRight,
    },
    {
      mode: 'left' as const,
      label: translate('tabContextMenu.closeToTheLeft'),
      disabled: !this.hasCloseableTabsToLeft,
    },
    { mode: 'others' as const, label: translate('tabContextMenu.closeOthers'), disabled: !this.hasCloseableOtherTabs },
    { mode: 'saved' as const, label: translate('tabContextMenu.closeSaved'), disabled: !this.hasSavedTabs },
    { mode: 'unsaved' as const, label: translate('tabContextMenu.closeNotSaved'), disabled: !this.hasUnsavedTabs },
    { mode: 'all' as const, label: translate('tabContextMenu.closeAll'), disabled: false },
  ]);

  private doExport = async (exportFn: () => Promise<void>) => {
    if (appContext.app.activeTabId !== this.tabId) appContext.app.activeTabId = this.tabId;
    await exportFn();
    this.onClose();
  };

  handleSave = async () => {
    try {
      await withActiveTab(this.tabId, saveCurrentFile);
    } catch {
      // save failed
    } finally {
      this.onClose();
    }
  };

  handleSaveAs = async () => {
    try {
      await withActiveTab(this.tabId, saveCurrentFileAs);
    } catch {
      // save as failed
    } finally {
      this.onClose();
    }
  };

  handlePin = () => {
    if (!this.tab) return;
    togglePin(this.tabId);
    this.onClose();
  };

  handleCloseMany = async (mode: 'right' | 'left' | 'others' | 'saved' | 'unsaved' | 'all') => {
    await closeManyTabs(mode, this.tabId);
    this.onClose();
  };

  handleMoveTab = async (to: 'start' | 'end') => {
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
  };

  handleRename = async () => {
    const tab = appContext.editor.tabs.find((t) => t.id === this.tabId);
    if (!tab) {
      this.onClose();
      return;
    }

    this.onClose();

    if (!tab.path) {
      const newTitle = await promptDialog({
        title: translate('tabContextMenu.renameTitle'),
        message: translate('tabContextMenu.renameTabMessage'),
        value: tab.customTitle || tab.title,
      });
      if (newTitle?.trim()) {
        updateTabTitle(this.tabId, newTitle.trim(), newTitle.trim());
      }
      return;
    }

    const currentFileName = getFilename(tab.path);
    const raw = await promptDialog({
      title: translate('tabContextMenu.renameTitle'),
      message: translate('tabContextMenu.renameFileMessage'),
      value: currentFileName,
    });
    if (!raw?.trim()) return;

    await renameFile(this.tabId, raw.trim());
  };

  handleSendToRecycleBin = async () => {
    const targetPath = this.tab?.path;
    const targetTitle = this.tab?.title;
    const targetId = this.tabId;

    if (!targetPath) {
      this.onClose();
      return;
    }

    this.onClose();

    try {
      if (!appContext.settings.confirmationSuppressed) {
        const result = await confirmDialog({
          title: translate('tabContextMenu.deleteFileTitle'),
          message: translate('tabContextMenu.deleteFileMessage', { values: { title: targetTitle ?? '' } }),
          discardLabel: translate('common.delete'),
          saveLabel: undefined,
        });

        if (result !== 'discard') return;
      }

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
  };

  handleToggleBookmark = async () => {
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
  };

  handleReopenClosed = async (index: number) => {
    triggerReopenClosedTab(index);
    this.onClose();
  };

  handleCopyTitle = async () => {
    const tab = appContext.editor.tabs.find((t) => t.id === this.tabId);
    try {
      if (tab) navigator.clipboard.writeText(tab.title);
    } catch {
      // clipboard write failed
    } finally {
      this.onClose();
    }
  };

  handleCopyPath = async () => {
    const tab = appContext.editor.tabs.find((t) => t.id === this.tabId);
    try {
      if (tab?.path) navigator.clipboard.writeText(tab.path);
    } catch {
      // clipboard write failed
    } finally {
      this.onClose();
    }
  };

  handleClose = () => {
    requestCloseTab(this.tabId);
    this.onClose();
  };

  getHistoryTooltip = (tab: EditorTab): string => {
    const lines = tab.content.slice(0, 300).split('\n').slice(0, 5);
    const preview = lines.join('\n') + (tab.content.length > 300 ? '...' : '');

    let title = tab.title;
    if (tab.path) title += `\n${tab.path}`;

    return `${title}\n\n${translate('tabContextMenu.previewHeader')}\n${preview}`;
  };

  formatTitle = (title: string): string => {
    if (title.length > 20) return `${title.substring(0, 20)}...`;
    return title;
  };

  sc = (commandId: string): string => {
    return shortcutManager.getShortcutDisplay(commandId);
  };
}
