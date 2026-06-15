import { setTheme, toggleSplitView, toggleWriterMode } from '$lib/stores/appState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { saveSettings } from '$lib/utils/settings';
import { isCurrentFileMarkdown } from './helpers';
import type { Command } from './types';

export const viewCommands: Command[] = [
  {
    id: 'theme.dark',
    label: 'Theme: Dark',
    category: 'Theme',
    handler: () => {
      setTheme('dark');
      saveSettings();
    },
  },
  {
    id: 'theme.light',
    label: 'Theme: Light',
    category: 'Theme',
    handler: () => {
      setTheme('light');
      saveSettings();
    },
  },
  {
    id: 'view.toggleSplitView',
    label: 'View: Toggle Split Preview',
    category: 'View',
    defaultKey: 'ctrl+\\',
    global: true,
    handler: (e) => {
      e?.preventDefault();
      e?.stopImmediatePropagation();
      if (!isCurrentFileMarkdown()) {
        showToast('warning', 'Preview not available for this file type');
        return;
      }
      toggleSplitView();
      saveSettings();
    },
  },
  {
    id: 'view.toggleWriterMode',
    label: 'View: Toggle Writer Mode',
    category: 'View',
    defaultKey: 'f11',
    global: true,
    handler: () => {
      const wasWriterMode = appContext.app.writerMode;
      toggleWriterMode();
      if (wasWriterMode) {
        document.exitFullscreen().catch((err) => console.debug('[View] exitFullscreen failed:', err));
      } else {
        document.documentElement
          .requestFullscreen()
          .catch((err) => console.debug('[View] requestFullscreen failed:', err));
      }
    },
  },
  {
    id: 'view.toggleWhitespace',
    label: 'View: Toggle Whitespace',
    category: 'View',
    defaultKey: 'ctrl+shift+8',
    handler: () => {
      appContext.app.showWhitespace = !appContext.app.showWhitespace;
      saveSettings();
    },
  },
  {
    id: 'view.zoomIn',
    label: 'View: Zoom In',
    category: 'View',
    showInPalette: false,
    defaultKey: 'ctrl+=',
    handler: (e) => {
      e?.preventDefault();
      appContext.app.editorFontSize = Math.min(32, appContext.app.editorFontSize + 1);
    },
  },
  {
    id: 'view.zoomOut',
    label: 'View: Zoom Out',
    category: 'View',
    showInPalette: false,
    defaultKey: 'ctrl+-',
    handler: (e) => {
      e?.preventDefault();
      appContext.app.editorFontSize = Math.max(8, appContext.app.editorFontSize - 1);
    },
  },
  {
    id: 'view.resetZoom',
    label: 'View: Reset Zoom',
    category: 'View',
    showInPalette: false,
    defaultKey: 'ctrl+0',
    handler: (e) => {
      e?.preventDefault();
      appContext.app.editorFontSize = 14;
    },
  },
  {
    id: 'escape',
    label: 'View: Escape / Exit Writer Mode',
    category: 'View',
    showInPalette: false,
    defaultKey: 'escape',
    global: true,
    handler: (): boolean => {
      const anyModalOpen =
        appContext.interface.showSettings ||
        appContext.interface.showShortcuts ||
        appContext.interface.showAbout ||
        appContext.interface.showBookmarks ||
        appContext.interface.showRecentFiles ||
        appContext.interface.showCommandPalette ||
        appContext.interface.showTransform ||
        appContext.interface.showData ||
        appContext.interface.showFind;

      if (anyModalOpen) return false;

      if (appContext.app.writerMode) {
        toggleWriterMode();
        document.exitFullscreen().catch((err) => console.debug('[View] exitFullscreen failed:', err));
        return true;
      }
      return false;
    },
  },
];
