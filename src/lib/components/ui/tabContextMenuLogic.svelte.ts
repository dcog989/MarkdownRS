import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { tick } from "svelte";
import { translate } from "$lib/i18n";
import { exportService } from "$lib/services/exportService";
import {
  addBookmark,
  deleteBookmark,
  getBookmarkByPath,
  isBookmarked as isBookmarkedSelector,
} from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog, promptDialog } from "$lib/stores/dialogStore.svelte";
import { pushToMru, reorderTabs, togglePin, updateTabTitle } from "$lib/stores/editorStore.svelte";
import type { EditorTab } from "$lib/stores/editorTypes";
import { triggerScrollToTab } from "$lib/stores/interfaceStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { AppError } from "$lib/utils/errorHandling";
import { trashFileOnDisk } from "$lib/utils/fileIO";
import {
  closeManyTabs,
  renameFile,
  requestCloseTab,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
  withActiveTab,
} from "$lib/utils/fileSystem";
import { getFilename } from "$lib/utils/fileValidation";
import { shortcutManager } from "$lib/utils/shortcuts";

type CloseSubmenu = "close" | "export" | "restore";

export class TabContextMenuLogic {
  tabId = $state("");
  onClose: () => void = () => {};

  constructor(tabId: string, onClose: () => void) {
    this.tabId = tabId;
    this.onClose = onClose;
  }

  activeSubmenu = $state<CloseSubmenu | null>(null);

  tab = $derived(appContext.editor.tabs.find((t) => t.id === this.tabId));
  isPinned = $derived(this.tab?.isPinned || false);
  isFileMissing = $derived(this.tab?.fileCheckFailed === true);
  isBookmarked = $derived(this.tab?.path ? isBookmarkedSelector(this.tab.path) : false);
  tabIndex = $derived(appContext.editor.tabs.findIndex((t) => t.id === this.tabId));

  // Pinned tabs are skipped by these close modes, so they must not enable them.
  hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty && !t.isPinned && t.id !== this.tabId));
  hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty && !t.isPinned && t.id !== this.tabId));
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
      label: translate("tabContextMenu.exportToHtml"),
      handler: () => this.doExport(() => exportService.exportToHtml()),
    },
    { label: translate("tabContextMenu.exportToPdf"), handler: () => this.doExport(() => exportService.exportToPdf()) },
    {
      label: translate("tabContextMenu.exportToDocx"),
      handler: () => this.doExport(() => exportService.exportToDocx()),
    },
    {
      label: translate("tabContextMenu.exportToEpub"),
      handler: () => this.doExport(() => exportService.exportToEpub()),
    },
    {
      label: translate("tabContextMenu.exportToLatex"),
      handler: () => this.doExport(() => exportService.exportToLatex()),
    },
    {
      label: translate("tabContextMenu.exportToPng"),
      handler: () => this.doExport(() => exportService.exportToImage("png")),
    },
    {
      label: translate("tabContextMenu.exportToWebp"),
      handler: () => this.doExport(() => exportService.exportToImage("webp")),
    },
  ]);

  closeManyItems = $derived([
    {
      mode: "right" as const,
      label: translate("tabContextMenu.closeToTheRight"),
      disabled: !this.hasCloseableTabsToRight,
    },
    {
      mode: "left" as const,
      label: translate("tabContextMenu.closeToTheLeft"),
      disabled: !this.hasCloseableTabsToLeft,
    },
    { mode: "others" as const, label: translate("tabContextMenu.closeOthers"), disabled: !this.hasCloseableOtherTabs },
    { mode: "saved" as const, label: translate("tabContextMenu.closeSaved"), disabled: !this.hasSavedTabs },
    { mode: "unsaved" as const, label: translate("tabContextMenu.closeNotSaved"), disabled: !this.hasUnsavedTabs },
    { mode: "all" as const, label: translate("tabContextMenu.closeAll"), disabled: false },
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

  handleCloseMany = async (mode: "right" | "left" | "others" | "saved" | "unsaved" | "all") => {
    await closeManyTabs(mode, this.tabId);
    this.onClose();
  };

  handleMoveTab = async (to: "start" | "end") => {
    const index = this.tabIndex;
    // A tab closed while the menu was open leaves no target; splice(-1) would
    // move the last tab instead.
    if (index === -1) {
      this.onClose();
      return;
    }
    const newTabs = [...appContext.editor.tabs];
    const [tab] = newTabs.splice(index, 1);
    if (to === "start") newTabs.unshift(tab);
    else newTabs.push(tab);
    reorderTabs(newTabs);
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
        title: translate("tabContextMenu.renameTitle"),
        message: translate("tabContextMenu.renameTabMessage"),
        value: tab.customTitle || tab.title,
      });
      if (newTitle?.trim()) {
        updateTabTitle(this.tabId, newTitle.trim(), newTitle.trim());
      }
      return;
    }

    const currentFileName = getFilename(tab.path);
    const raw = await promptDialog({
      title: translate("tabContextMenu.renameTitle"),
      message: translate("tabContextMenu.renameFileMessage"),
      value: currentFileName,
    });
    if (!raw?.trim()) return;

    await renameFile(this.tabId, raw.trim());
  };

  handleSendToRecycleBin = async () => {
    const targetPath = this.tab?.path;
    const targetTitle = this.tab?.title;
    const targetId = this.tabId;

    this.onClose();

    if (!targetPath) return;

    try {
      if (!appContext.settings.confirmationSuppressed) {
        const result = await confirmDialog({
          title: translate("tabContextMenu.deleteFileTitle"),
          message: translate("tabContextMenu.deleteFileMessage", { values: { title: targetTitle ?? "" } }),
          discardLabel: translate("common.delete"),
          saveLabel: undefined,
        });

        if (result !== "discard") return;
      }

      // Close the tab before trashing: the close prompt can be cancelled (or
      // its save can fail), and the file must not already be gone when it is.
      // A saved prompt would otherwise write the "deleted" file back.
      await requestCloseTab(targetId, true);
      if (appContext.editor.tabs.some((t) => t.id === targetId)) return;

      if (!(await trashFileOnDisk(targetPath))) return;
      (await import("$lib/services/fileMetadata")).invalidateMetadataCache(targetPath);
    } catch (err) {
      AppError.handle("File:Write", err, {
        showToast: true,
        userMessage: translate("fileOps.failedDelete"),
      });
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

  handleReopenClosed = async (tabId: string) => {
    // Resolve at click time: tabs closed or reopened while the submenu is open
    // shift the positions the list was rendered with.
    const index = appContext.editor.closedTabsHistory.findIndex((entry) => entry.tab.id === tabId);
    void triggerReopenClosedTab(index);
    this.onClose();
  };

  handleReopenLastClosed = () => {
    const latest = this.closedTabs[0];
    if (latest) void this.handleReopenClosed(latest.tab.id);
    else this.onClose();
  };

  // writeText rejects when the webview denies clipboard access; unawaited it
  // would surface as an unhandled rejection and a copy that silently did nothing.
  private copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      showToast("error", translate("editor.copyFailed"));
    }
  };

  handleCopyTitle = async () => {
    const tab = appContext.editor.tabs.find((t) => t.id === this.tabId);
    if (tab) {
      // tab.title can be the document's first heading (tabNameFromContent); the
      // menu promises the file name, so read it off the path when there is one.
      const name = tab.path ? getFilename(tab.path) : tab.customTitle || tab.title;
      await this.copyToClipboard(name);
    }
    this.onClose();
  };

  handleCopyPath = async () => {
    const tab = appContext.editor.tabs.find((t) => t.id === this.tabId);
    if (tab?.path) await this.copyToClipboard(tab.path);
    this.onClose();
  };

  handleRevealInFileManager = async () => {
    const path = this.tab?.path;
    try {
      if (path) await revealItemInDir(path);
    } catch {
      // reveal failed; nothing to report
    } finally {
      this.onClose();
    }
  };

  handleClose = () => {
    requestCloseTab(this.tabId);
    this.onClose();
  };

  getHistoryTooltip = (tab: EditorTab): string => {
    const lines = tab.content.slice(0, 300).split("\n").slice(0, 5);
    const preview = lines.join("\n") + (tab.content.length > 300 ? "..." : "");

    let title = tab.title;
    if (tab.path) title += `\n${tab.path}`;

    return `${title}\n\n${translate("tabContextMenu.previewHeader")}\n${preview}`;
  };

  formatTitle = (title: string): string => {
    if (title.length > 20) return `${title.substring(0, 20)}...`;
    return title;
  };

  sc = (commandId: string): string => {
    return shortcutManager.getShortcutDisplay(commandId);
  };
}
