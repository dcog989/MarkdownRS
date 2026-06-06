import { exportService } from '$lib/services/exportService';
import { setTheme, toggleSplitView, toggleWriterMode } from '$lib/stores/appState.svelte';
import { addBookmark } from '$lib/stores/bookmarkStore.svelte';
import { addTab, performTextTransform, pushToMru } from '$lib/stores/editorStore.svelte';
import {
  openFind,
  openReplace,
  toggleAbout,
  toggleBookmarks,
  toggleCommandPalette,
  toggleRecentFiles,
  toggleShortcuts,
  toggleTransform,
} from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { dispatchRedo, dispatchUndo } from '$lib/utils/editorCommands';
import {
  openFile,
  requestCloseTab,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
} from '$lib/utils/fileSystem';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';

export interface Command {
  id: string;
  label: string;
  category: string;
  defaultKey?: string;
  // biome-ignore lint/suspicious/noConfusingVoidType: idiomatic handler return type
  handler?: (e?: KeyboardEvent) => void | boolean | Promise<void | boolean>;
  showInPalette?: boolean;
}

function isCurrentFileMarkdown(): boolean {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
  if (!activeTab) return true;
  return activeTab.path ? isMarkdownFile(activeTab.path) : true;
}

function dispatchKeyEvent(key: string, ctrl = true, shift = false, alt = false): void {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(event);
}

export const commands: Command[] = [
  // File
  {
    id: 'file.new',
    label: 'File: New File',
    category: 'File',
    defaultKey: 'ctrl+n',
    handler: () => {
      const id = addTab();
      appContext.app.activeTabId = id;
    },
  },
  {
    id: 'file.open',
    label: 'File: Open File',
    category: 'File',
    defaultKey: 'ctrl+o',
    handler: () => openFile(),
  },
  {
    id: 'file.save',
    label: 'File: Save',
    category: 'File',
    defaultKey: 'ctrl+s',
    handler: () => saveCurrentFile(),
  },
  {
    id: 'file.saveAs',
    label: 'File: Save As...',
    category: 'File',
    defaultKey: 'ctrl+shift+s',
    handler: saveCurrentFileAs,
  },
  {
    id: 'file.closeTab',
    label: 'File: Close Tab',
    category: 'File',
    defaultKey: 'ctrl+w',
    handler: () => {
      if (appContext.app.activeTabId) {
        requestCloseTab(appContext.app.activeTabId);
      }
    },
  },
  {
    id: 'file.reopenClosedTab',
    label: 'File: Reopen Last Closed Tab',
    category: 'File',
    defaultKey: 'ctrl+shift+t',
    handler: () => triggerReopenClosedTab(0),
  },
  {
    id: 'file.addBookmark',
    label: 'File: Add to Bookmarks',
    category: 'File',
    defaultKey: 'ctrl+d',
    handler: async () => {
      const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
      if (tab?.path) {
        const { isNew } = await addBookmark(tab.path, tab.title);
        if (isNew) {
          showToast('success', `Added "${tab.title}" to bookmarks`);
        } else {
          showToast('info', `"${tab.title}" is already bookmarked`);
        }
      } else {
        showToast('warning', 'Save the file before bookmarking');
      }
    },
  },
  {
    id: 'file.recentFiles',
    label: 'File: Recent Files...',
    category: 'File',
    defaultKey: 'ctrl+p',
    handler: toggleRecentFiles,
  },

  // Edit
  {
    id: 'edit.undo',
    label: 'Edit: Undo',
    category: 'Edit',
    defaultKey: 'ctrl+z',
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchUndo(appContext.app.activeTabId);
      }
    },
  },
  {
    id: 'edit.redo',
    label: 'Edit: Redo',
    category: 'Edit',
    defaultKey: 'ctrl+y',
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchRedo(appContext.app.activeTabId);
      }
    },
  },

  // Export
  {
    id: 'export.html',
    label: 'Export: HTML',
    category: 'Export',
    handler: () => exportService.exportToHtml(),
  },
  {
    id: 'export.pdf',
    label: 'Export: PDF',
    category: 'Export',
    handler: () => exportService.exportToPdf(),
  },
  {
    id: 'export.png',
    label: 'Export: PNG',
    category: 'Export',
    handler: () => exportService.exportToImage('png'),
  },
  {
    id: 'export.webp',
    label: 'Export: WebP',
    category: 'Export',
    handler: () => exportService.exportToImage('webp'),
  },
  {
    id: 'export.svg',
    label: 'Export: SVG',
    category: 'Export',
    handler: () => exportService.exportToImage('svg'),
  },

  // Theme
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

  // View
  {
    id: 'view.toggleSplitView',
    label: 'View: Toggle Split Preview',
    category: 'View',
    defaultKey: 'ctrl+\\',
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
    handler: () => {
      const wasWriterMode = appContext.app.writerMode;
      toggleWriterMode();
      if (wasWriterMode) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
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

  // Navigation
  {
    id: 'nav.nextTab',
    label: 'Navigation: Next Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+pagedown',
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (!appContext.app.activeTabId) return;
      const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
      if (currentIndex >= 0) {
        const nextIndex = (currentIndex + 1) % tabs.length;
        const id = tabs[nextIndex].id;
        appContext.app.activeTabId = id;
        pushToMru(id);
      }
    },
  },
  {
    id: 'nav.prevTab',
    label: 'Navigation: Previous Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+pageup',
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (!appContext.app.activeTabId) return;
      const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
      if (currentIndex >= 0) {
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        const id = tabs[prevIndex].id;
        appContext.app.activeTabId = id;
        pushToMru(id);
      }
    },
  },

  // Navigation - Tab shortcuts
  {
    id: 'nav.tab1',
    label: 'Navigation: Go to Tab 1',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+1',
    handler: () => {
      const tab = appContext.editor.tabs[0];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  },
  {
    id: 'nav.tab2',
    label: 'Navigation: Go to Tab 2',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+2',
    handler: () => {
      const tab = appContext.editor.tabs[1];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  },
  {
    id: 'nav.tab3',
    label: 'Navigation: Go to Tab 3',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+3',
    handler: () => {
      const tab = appContext.editor.tabs[2];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  },
  {
    id: 'nav.tab4',
    label: 'Navigation: Go to Tab 4',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+4',
    handler: () => {
      const tab = appContext.editor.tabs[3];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  },
  {
    id: 'nav.tab5',
    label: 'Navigation: Go to Tab 5',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+5',
    handler: () => {
      const tab = appContext.editor.tabs[4];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  },
  {
    id: 'nav.lastTab',
    label: 'Navigation: Go to Last Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+9',
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (tabs.length > 0) {
        appContext.app.activeTabId = tabs[tabs.length - 1].id;
      }
    },
  },

  // Edit - Misc
  {
    id: 'edit.gotoLine',
    label: 'Editor: Go to Line',
    category: 'Editor',
    showInPalette: false,
    defaultKey: 'ctrl+g',
  },

  // Window
  {
    id: 'window.commandPalette',
    label: 'Window: Command Palette',
    category: 'Window',
    defaultKey: 'ctrl+shift+p',
    handler: toggleCommandPalette,
  },
  {
    id: 'window.bookmarks',
    label: 'Window: Bookmarks',
    category: 'Window',
    defaultKey: 'ctrl+shift+b',
    handler: toggleBookmarks,
  },
  {
    id: 'window.settings',
    label: 'Window: Settings',
    category: 'Window',
    defaultKey: 'ctrl+,',
    handler: () => {
      appContext.interface.showSettings = true;
    },
  },
  {
    id: 'window.shortcuts',
    label: 'Window: Keyboard Shortcuts',
    category: 'Window',
    defaultKey: 'f1',
    handler: toggleShortcuts,
  },
  {
    id: 'window.about',
    label: 'Window: About',
    category: 'Window',
    handler: toggleAbout,
  },
  {
    id: 'window.transform',
    label: 'Window: Text Transformations',
    category: 'Window',
    defaultKey: 'ctrl+t',
    handler: (e) => {
      e?.preventDefault();
      e?.stopImmediatePropagation();
      toggleTransform();
    },
  },

  // Editor
  {
    id: 'editor.toggleComment',
    label: 'Editor: Toggle Line Comment',
    category: 'Editor',
    defaultKey: 'ctrl+/',
    handler: () => dispatchKeyEvent('/', true),
  },
  {
    id: 'editor.find',
    label: 'Editor: Find',
    category: 'Editor',
    defaultKey: 'ctrl+f',
    handler: openFind,
  },
  {
    id: 'editor.replace',
    label: 'Editor: Replace',
    category: 'Editor',
    defaultKey: 'ctrl+h',
    handler: openReplace,
  },
  {
    id: 'editor.duplicateLine',
    label: 'Editor: Duplicate Line/Selection',
    category: 'Editor',
    defaultKey: 'ctrl+shift+d',
    handler: () => dispatchKeyEvent('d', true, true),
  },
  {
    id: 'editor.deleteLine',
    label: 'Editor: Delete Line',
    category: 'Editor',
    defaultKey: 'ctrl+shift+k',
    handler: () => dispatchKeyEvent('k', true, true),
  },
  {
    id: 'editor.moveLineUp',
    label: 'Editor: Move Line Up',
    category: 'Editor',
    defaultKey: 'alt+arrowup',
    handler: () => dispatchKeyEvent('ArrowUp', false, false, true),
  },
  {
    id: 'editor.moveLineDown',
    label: 'Editor: Move Line Down',
    category: 'Editor',
    defaultKey: 'alt+arrowdown',
    handler: () => dispatchKeyEvent('ArrowDown', false, false, true),
  },
  {
    id: 'editor.copyLineUp',
    label: 'Editor: Copy Line Up',
    category: 'Editor',
    defaultKey: 'shift+alt+arrowup',
    handler: () => dispatchKeyEvent('ArrowUp', false, true, true),
  },
  {
    id: 'editor.addCursorAbove',
    label: 'Editor: Add Cursor Above',
    category: 'Editor',
    defaultKey: 'ctrl+alt+arrowup',
    handler: () => dispatchKeyEvent('ArrowUp', true, false, true),
  },
  {
    id: 'editor.addCursorBelow',
    label: 'Editor: Add Cursor Below',
    category: 'Editor',
    defaultKey: 'ctrl+alt+arrowdown',
    handler: () => dispatchKeyEvent('ArrowDown', true, false, true),
  },
  {
    id: 'editor.selectLine',
    label: 'Editor: Select Line',
    category: 'Editor',
    defaultKey: 'ctrl+l',
    handler: () => dispatchKeyEvent('l', true),
  },
  {
    id: 'editor.gotoMatchingBracket',
    label: 'Editor: Go to Matching Bracket',
    category: 'Editor',
    defaultKey: 'ctrl+shift+\\',
    handler: () => dispatchKeyEvent('\\', true, true),
  },
  {
    id: 'editor.indent',
    label: 'Editor: Indent',
    category: 'Editor',
    defaultKey: 'ctrl+]',
    handler: () => dispatchKeyEvent(']', true),
  },
  {
    id: 'editor.outdent',
    label: 'Editor: Outdent',
    category: 'Editor',
    defaultKey: 'ctrl+[',
    handler: () => dispatchKeyEvent('[', true),
  },

  // Markdown formatting
  {
    id: 'markdown.bold',
    label: 'Markdown: Bold',
    category: 'Markdown',
    defaultKey: 'ctrl+b',
    handler: () => performTextTransform('bold'),
  },
  {
    id: 'markdown.italic',
    label: 'Markdown: Italic',
    category: 'Markdown',
    defaultKey: 'ctrl+i',
    handler: () => performTextTransform('italic'),
  },
  {
    id: 'markdown.link',
    label: 'Markdown: Insert Link',
    category: 'Markdown',
    defaultKey: 'ctrl+k',
    handler: () => performTextTransform('insert-link'),
  },
  {
    id: 'markdown.strikethrough',
    label: 'Markdown: Strikethrough',
    category: 'Markdown',
    defaultKey: '',
    handler: () => performTextTransform('strike'),
  },
  {
    id: 'markdown.inlineCode',
    label: 'Markdown: Inline Code',
    category: 'Markdown',
    defaultKey: '',
    handler: () => performTextTransform('inline-code'),
  },

  // Escape / exit writer mode
  {
    id: 'escape',
    label: 'View: Escape / Exit Writer Mode',
    category: 'View',
    showInPalette: false,
    defaultKey: 'escape',
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
        document.exitFullscreen().catch(() => {});
        return true;
      }
      return false;
    },
  },
];
