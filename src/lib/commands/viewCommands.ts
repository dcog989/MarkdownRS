import { translate } from "$lib/i18n";
import { toggleWriterMode } from "$lib/stores/appState.svelte";
import { refreshTree } from "$lib/stores/fileTreeStore.svelte";
import { setTheme, toggleFileTree, toggleSplitView, toggleViewMode } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { saveSettings } from "$lib/utils/settings";
import { isCurrentFileMarkdown } from "./helpers";
import type { Command } from "./types";

export const viewCommands: Command[] = [
  {
    id: "theme.dark",
    label: "Dark",
    labelKey: "command.themeDark",
    category: "commandCategory.theme",
    handler: () => {
      setTheme("dark");
      saveSettings();
    },
  },
  {
    id: "theme.light",
    label: "Light",
    labelKey: "command.themeLight",
    category: "commandCategory.theme",
    handler: () => {
      setTheme("light");
      saveSettings();
    },
  },
  {
    id: "view.toggleSplitView",
    label: "Toggle Split Preview",
    labelKey: "command.toggleSplitPreview",
    category: "commandCategory.view",
    defaultKey: "ctrl+\\",
    global: true,
    handler: (e) => {
      e?.preventDefault();
      e?.stopImmediatePropagation();
      if (!isCurrentFileMarkdown()) {
        showToast("warning", translate("tabBarMenu.previewNotAvailable"));
        return;
      }
      toggleSplitView();
      saveSettings();
    },
  },
  {
    id: "view.toggleWriterMode",
    label: "Toggle Writer Mode",
    labelKey: "command.toggleWriterMode",
    category: "commandCategory.view",
    defaultKey: "f9",
    global: true,
    handler: () => {
      toggleWriterMode();
    },
  },
  {
    id: "view.toggleFileTree",
    label: "Toggle File Tree",
    labelKey: "command.toggleFileTree",
    category: "commandCategory.view",
    defaultKey: "ctrl+`",
    global: true,
    handler: () => {
      toggleFileTree();
      saveSettings();
    },
  },
  {
    id: "view.refreshFileTree",
    label: "Refresh File Tree",
    labelKey: "command.refreshFileTree",
    category: "commandCategory.view",
    defaultKey: "f5",
    global: true,
    handler: (e): boolean => {
      const tree = document.querySelector(".file-tree-root");
      if (!tree) return false;
      const active = document.activeElement;
      const isFocused = active instanceof HTMLElement && tree.contains(active);
      const isHovered = tree.matches(":hover");
      if (!isFocused && !isHovered) return false;
      e?.preventDefault();
      void refreshTree();
      return true;
    },
  },
  {
    id: "view.toggleViewMode",
    label: "Toggle Raw/Rendered Mode",
    labelKey: "command.toggleViewMode",
    category: "commandCategory.view",
    defaultKey: "ctrl+shift+r",
    handler: () => {
      toggleViewMode();
    },
  },
  {
    id: "view.toggleWhitespace",
    label: "Toggle Whitespace",
    labelKey: "command.toggleWhitespace",
    category: "commandCategory.view",
    defaultKey: "ctrl+shift+8",
    handler: () => {
      appContext.settings.showWhitespace = !appContext.settings.showWhitespace;
      saveSettings();
    },
  },
  {
    id: "view.zoomIn",
    label: "Zoom In",
    labelKey: "command.zoomIn",
    category: "commandCategory.view",
    showInPalette: false,
    defaultKey: "ctrl+=",
    handler: (e) => {
      e?.preventDefault();
      appContext.settings.editorFontSize = Math.min(32, appContext.settings.editorFontSize + 1);
    },
  },
  {
    id: "view.zoomOut",
    label: "Zoom Out",
    labelKey: "command.zoomOut",
    category: "commandCategory.view",
    showInPalette: false,
    defaultKey: "ctrl+-",
    handler: (e) => {
      e?.preventDefault();
      appContext.settings.editorFontSize = Math.max(8, appContext.settings.editorFontSize - 1);
    },
  },
  {
    id: "view.resetZoom",
    label: "Reset Zoom",
    labelKey: "command.resetZoom",
    category: "commandCategory.view",
    showInPalette: false,
    defaultKey: "ctrl+0",
    handler: (e) => {
      e?.preventDefault();
      appContext.settings.editorFontSize = 14;
    },
  },
  {
    id: "escape",
    label: "Escape / Exit Writer Mode",
    labelKey: "command.escapeWriterMode",
    category: "commandCategory.view",
    showInPalette: false,
    defaultKey: "escape",
    global: true,
    handler: (): boolean => {
      const anyModalOpen =
        appContext.interface.showSettings ||
        appContext.interface.showShortcuts ||
        appContext.interface.showAbout ||
        appContext.interface.showBookmarks ||
        appContext.interface.showFileHistory ||
        appContext.interface.showCommandPalette ||
        appContext.interface.showData ||
        appContext.interface.showRumdlConfig ||
        appContext.interface.showEmojiPicker ||
        appContext.interface.showFind;

      if (anyModalOpen) return false;

      if (appContext.app.writerMode) {
        toggleWriterMode();
        return true;
      }
      return false;
    },
  },
];
