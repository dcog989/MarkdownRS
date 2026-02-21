/**
 * Register all application shortcuts
 * Mimics VS Code shortcuts where applicable
 */

import { toggleSplitView, toggleWriterMode } from '$lib/stores/appState.svelte';
import { addTab, reopenLastClosed } from '$lib/stores/editorStore.svelte';
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
import { appContext } from '$lib/stores/state.svelte.ts';
import { dispatchRedo, dispatchUndo } from '$lib/utils/editorCommands';
import {
    openFile,
    requestCloseTab,
    saveCurrentFile,
    saveCurrentFileAs,
} from '$lib/utils/fileSystem';
import { shortcutManager, type ShortcutDefinition } from '$lib/utils/shortcuts';

export function registerAllShortcuts() {
    const shortcuts: ShortcutDefinition[] = [
        // File Operations
        {
            id: 'file.new',
            command: 'file.new',
            defaultKey: 'ctrl+n',
            description: 'New File',
            category: 'File',
            handler: () => {
                const id = addTab('', '');
                appContext.app.activeTabId = id;
            },
        },
        {
            id: 'file.open',
            command: 'file.open',
            defaultKey: 'ctrl+o',
            description: 'Open File',
            category: 'File',
            handler: async () => {
                await openFile();
            },
        },
        {
            id: 'file.save',
            command: 'file.save',
            defaultKey: 'ctrl+s',
            description: 'Save File',
            category: 'File',
            handler: async () => {
                await saveCurrentFile();
            },
        },
        {
            id: 'file.saveAs',
            command: 'file.saveAs',
            defaultKey: 'ctrl+shift+s',
            description: 'Save File As',
            category: 'File',
            handler: async () => {
                await saveCurrentFileAs();
            },
        },
        {
            id: 'file.closeTab',
            command: 'file.closeTab',
            defaultKey: 'ctrl+w',
            description: 'Close Tab',
            category: 'File',
            handler: () => {
                if (appContext.app.activeTabId) {
                    requestCloseTab(appContext.app.activeTabId);
                }
            },
        },

        // Edit Operations
        {
            id: 'edit.undo',
            command: 'edit.undo',
            defaultKey: 'ctrl+z',
            description: 'Undo',
            category: 'Edit',
            handler: () => {
                if (appContext.app.activeTabId) {
                    dispatchUndo(appContext.app.activeTabId);
                }
            },
        },
        {
            id: 'edit.redo',
            command: 'edit.redo',
            defaultKey: 'ctrl+y',
            description: 'Redo',
            category: 'Edit',
            handler: () => {
                if (appContext.app.activeTabId) {
                    dispatchRedo(appContext.app.activeTabId);
                }
            },
        },
        {
            id: 'edit.find',
            command: 'edit.find',
            defaultKey: 'ctrl+f',
            description: 'Find',
            category: 'Edit',
            handler: () => {
                openFind();
            },
        },
        {
            id: 'edit.replace',
            command: 'edit.replace',
            defaultKey: 'ctrl+h',
            description: 'Replace',
            category: 'Edit',
            handler: () => {
                openReplace();
            },
        },
        {
            id: 'edit.reopenClosedTab',
            command: 'edit.reopenClosedTab',
            defaultKey: 'ctrl+shift+t',
            description: 'Reopen Closed Tab',
            category: 'Edit',
            handler: () => {
                reopenLastClosed();
            },
        },

        // View Operations
        {
            id: 'view.toggleSplitView',
            command: 'view.toggleSplitView',
            defaultKey: 'ctrl+\\',
            description: 'Toggle Split View',
            category: 'View',
            handler: () => {
                toggleSplitView();
            },
        },
        {
            id: 'view.toggleWriterMode',
            command: 'view.toggleWriterMode',
            defaultKey: 'f11',
            description: 'Toggle Writer Mode',
            category: 'View',
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
            id: 'view.zoomIn',
            command: 'view.zoomIn',
            defaultKey: 'ctrl+=',
            description: 'Zoom In',
            category: 'View',
            handler: (e: KeyboardEvent) => {
                e.preventDefault();
                appContext.app.editorFontSize = Math.min(32, appContext.app.editorFontSize + 1);
            },
        },
        {
            id: 'view.zoomOut',
            command: 'view.zoomOut',
            defaultKey: 'ctrl+-',
            description: 'Zoom Out',
            category: 'View',
            handler: (e: KeyboardEvent) => {
                e.preventDefault();
                appContext.app.editorFontSize = Math.max(8, appContext.app.editorFontSize - 1);
            },
        },
        {
            id: 'view.resetZoom',
            command: 'view.resetZoom',
            defaultKey: 'ctrl+0',
            description: 'Reset Zoom',
            category: 'View',
            handler: (e: KeyboardEvent) => {
                e.preventDefault();
                appContext.app.editorFontSize = 14;
            },
        },

        // Navigation
        {
            id: 'nav.quickOpen',
            command: 'nav.quickOpen',
            defaultKey: 'ctrl+p',
            description: 'Quick Open (Recent Files)',
            category: 'Navigation',
            handler: () => {
                toggleRecentFiles();
            },
        },
        {
            id: 'nav.nextTab',
            command: 'nav.nextTab',
            defaultKey: 'ctrl+pagedown',
            description: 'Next Tab',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
                if (currentIndex >= 0) {
                    const nextIndex = (currentIndex + 1) % tabs.length;
                    appContext.app.activeTabId = tabs[nextIndex].id;
                }
            },
        },
        {
            id: 'nav.prevTab',
            command: 'nav.prevTab',
            defaultKey: 'ctrl+pageup',
            description: 'Previous Tab',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
                if (currentIndex >= 0) {
                    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                    appContext.app.activeTabId = tabs[prevIndex].id;
                }
            },
        },
        {
            id: 'nav.tab1',
            command: 'nav.tab1',
            defaultKey: 'ctrl+1',
            description: 'Go to Tab 1',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs[0]) appContext.app.activeTabId = tabs[0].id;
            },
        },
        {
            id: 'nav.tab2',
            command: 'nav.tab2',
            defaultKey: 'ctrl+2',
            description: 'Go to Tab 2',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs[1]) appContext.app.activeTabId = tabs[1].id;
            },
        },
        {
            id: 'nav.tab3',
            command: 'nav.tab3',
            defaultKey: 'ctrl+3',
            description: 'Go to Tab 3',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs[2]) appContext.app.activeTabId = tabs[2].id;
            },
        },
        {
            id: 'nav.tab4',
            command: 'nav.tab4',
            defaultKey: 'ctrl+4',
            description: 'Go to Tab 4',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs[3]) appContext.app.activeTabId = tabs[3].id;
            },
        },
        {
            id: 'nav.tab5',
            command: 'nav.tab5',
            defaultKey: 'ctrl+5',
            description: 'Go to Tab 5',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs[4]) appContext.app.activeTabId = tabs[4].id;
            },
        },
        {
            id: 'nav.lastTab',
            command: 'nav.lastTab',
            defaultKey: 'ctrl+9',
            description: 'Go to Last Tab',
            category: 'Navigation',
            handler: () => {
                const tabs = appContext.editor.tabs;
                if (tabs.length > 0) {
                    appContext.app.activeTabId = tabs[tabs.length - 1].id;
                }
            },
        },

        // Window / UI
        {
            id: 'window.commandPalette',
            command: 'window.commandPalette',
            defaultKey: 'ctrl+shift+p',
            description: 'Command Palette',
            category: 'Window',
            handler: () => {
                toggleCommandPalette();
            },
        },
        {
            id: 'window.bookmarks',
            command: 'window.bookmarks',
            defaultKey: 'ctrl+shift+b',
            description: 'Bookmarks',
            category: 'Window',
            handler: () => {
                toggleBookmarks();
            },
        },
        {
            id: 'window.transform',
            command: 'window.transform',
            defaultKey: 'ctrl+t',
            description: 'Text Transformations',
            category: 'Window',
            handler: () => {
                toggleTransform();
            },
        },
        {
            id: 'window.about',
            command: 'window.about',
            defaultKey: '',
            description: 'About',
            category: 'Window',
            handler: () => {
                toggleAbout();
            },
        },

        // Markdown formatting (handled inside CodeMirror keymap, registered here for display)
        {
            id: 'markdown.bold',
            command: 'markdown.bold',
            defaultKey: 'ctrl+b',
            description: 'Bold',
            category: 'Markdown',
        },
        {
            id: 'markdown.italic',
            command: 'markdown.italic',
            defaultKey: 'ctrl+i',
            description: 'Italic',
            category: 'Markdown',
        },
        {
            id: 'markdown.link',
            command: 'markdown.link',
            defaultKey: 'ctrl+k',
            description: 'Insert Link',
            category: 'Markdown',
        },
        {
            id: 'markdown.bookmark',
            command: 'markdown.bookmark',
            defaultKey: 'ctrl+d',
            description: 'Add to Bookmarks',
            category: 'Markdown',
        },
        {
            id: 'markdown.comment',
            command: 'markdown.comment',
            defaultKey: 'ctrl+/',
            description: 'Toggle Comment',
            category: 'Markdown',
        },
        {
            id: 'edit.duplicateLine',
            command: 'edit.duplicateLine',
            defaultKey: 'ctrl+shift+d',
            description: 'Duplicate Line/Selection',
            category: 'Edit',
        },
        {
            id: 'edit.gotoLine',
            command: 'edit.gotoLine',
            defaultKey: 'ctrl+g',
            description: 'Go to Line',
            category: 'Edit',
        },

        // Help
        {
            id: 'help.shortcuts',
            command: 'help.shortcuts',
            defaultKey: 'f1',
            description: 'Show Keyboard Shortcuts',
            category: 'Help',
            handler: () => {
                toggleShortcuts();
            },
        },
        {
            id: 'help.settings',
            command: 'help.settings',
            defaultKey: 'ctrl+,',
            description: 'Open Settings',
            category: 'Help',
            handler: () => {
                appContext.interface.showSettings = true;
            },
        },
    ];

    // Register all shortcuts
    shortcuts.forEach((shortcut) => shortcutManager.register(shortcut));
}
