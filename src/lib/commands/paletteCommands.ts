/**
 * Command Palette Command Definitions
 *
 * Static command definitions for the command palette.
 * All imports are at the top for tree-shaking and clarity.
 */

import { exportService } from '$lib/services/exportService';
import { setTheme, toggleSplitView } from '$lib/stores/appState.svelte';
import { addBookmark } from '$lib/stores/bookmarkStore.svelte';
import { addTab } from '$lib/stores/editorStore.svelte';
import {
    openFind,
    openReplace,
    toggleAbout,
    toggleBookmarks,
    toggleCommandPalette,
    toggleRecentFiles,
    toggleSettings,
    toggleShortcuts,
    toggleTransform,
} from '$lib/stores/interfaceStore.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import {
    openFile,
    openFileByPath,
    requestCloseTab,
    saveCurrentFile,
    saveCurrentFileAs,
    triggerReopenClosedTab,
} from '$lib/utils/fileSystem';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';

/** Command definition for the command palette */
export interface Command {
    id: string;
    label: string;
    shortcut?: string;
    action: () => void | Promise<void>;
}

// Helper to dispatch keyboard events
function dispatchKeyEvent(key: string, ctrlKey = true, shiftKey = false): void {
    const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey,
        shiftKey,
        bubbles: true,
        cancelable: true,
    });
    document.activeElement?.dispatchEvent(event);
}

// Helper to check if current file is markdown
function isCurrentFileMarkdown(): boolean {
    const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
    if (!activeTab) return true;
    return activeTab.path ? isMarkdownFile(activeTab.path) : true;
}

// File Commands
export const fileCommands: Command[] = [
    {
        id: 'new',
        label: 'File: New File',
        action: () => {
            const id = addTab();
            appContext.app.activeTabId = id;
        },
    },
    {
        id: 'open',
        label: 'File: Open File',
        action: openFile,
    },
    {
        id: 'recent-files',
        label: 'File: Recent Files...',
        action: toggleRecentFiles,
    },
    {
        id: 'save',
        label: 'File: Save',
        action: saveCurrentFile,
    },
    {
        id: 'save-as',
        label: 'File: Save As...',
        action: saveCurrentFileAs,
    },
    {
        id: 'close',
        label: 'File: Close Tab',
        action: async () => {
            if (appContext.app.activeTabId) {
                await requestCloseTab(appContext.app.activeTabId);
            }
        },
    },
    {
        id: 'file.reopen_closed',
        label: 'File: Reopen Last Closed Tab',
        action: () => triggerReopenClosedTab(0),
    },
    {
        id: 'editor.bookmark_add',
        label: 'File: Add to Bookmarks',
        action: async () => {
            const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
            if (tab?.path) {
                await addBookmark(tab.path, tab.title);
                showToast('success', `Added "${tab.title}" to bookmarks`);
            } else {
                showToast('warning', 'Save the file before bookmarking');
            }
        },
    },
];

// Export Commands
export const exportCommands: Command[] = [
    {
        id: 'export-html',
        label: 'Export: HTML',
        action: () => exportService.exportToHtml(),
    },
    {
        id: 'export-pdf',
        label: 'Export: PDF',
        action: () => exportService.exportToPdf(),
    },
    {
        id: 'export-png',
        label: 'Export: PNG',
        action: () => exportService.exportToImage('png'),
    },
    {
        id: 'export-webp',
        label: 'Export: WebP',
        action: () => exportService.exportToImage('webp'),
    },
    {
        id: 'export-svg',
        label: 'Export: SVG',
        action: () => exportService.exportToImage('svg'),
    },
];

// Theme Commands
export const themeCommands: Command[] = [
    {
        id: 'theme-dark',
        label: 'Theme: Dark',
        action: () => {
            setTheme('dark');
            saveSettings();
        },
    },
    {
        id: 'theme-light',
        label: 'Theme: Light',
        action: () => {
            setTheme('light');
            saveSettings();
        },
    },
];

// View Commands
export const viewCommands: Command[] = [
    {
        id: 'toggle-split',
        label: 'View: Toggle Split Preview',
        action: () => {
            if (!isCurrentFileMarkdown()) {
                showToast('warning', 'Preview not available for this file type');
                return;
            }
            toggleSplitView();
            saveSettings();
        },
    },
    {
        id: 'toggle-whitespace',
        label: 'View: Toggle Whitespace',
        action: () => {
            appContext.app.showWhitespace = !appContext.app.showWhitespace;
            saveSettings();
        },
    },
];

// Window Commands
export const windowCommands: Command[] = [
    {
        id: 'bookmarks',
        label: 'Window: Bookmarks',
        action: toggleBookmarks,
    },
    {
        id: 'command-palette',
        label: 'Window: Command Palette',
        action: toggleCommandPalette,
    },
    {
        id: 'settings',
        label: 'Window: Settings',
        action: toggleSettings,
    },
    {
        id: 'shortcuts',
        label: 'Window: Keyboard Shortcuts',
        action: toggleShortcuts,
    },
    {
        id: 'transform',
        label: 'Window: Text Transformations',
        action: toggleTransform,
    },
    {
        id: 'about',
        label: 'Window: About',
        action: toggleAbout,
    },
];

// Editor Commands
export const editorCommands: Command[] = [
    {
        id: 'editor.toggle_comment',
        label: 'Editor: Toggle Line Comment',
        action: () => dispatchKeyEvent('/', true, false),
    },
    {
        id: 'find.show',
        label: 'Editor: Find',
        action: openFind,
    },
    {
        id: 'find.show_replace',
        label: 'Editor: Replace',
        action: openReplace,
    },
    {
        id: 'editor.duplicate_line',
        label: 'Editor: Duplicate Line/Selection',
        action: () => dispatchKeyEvent('d', true, true),
    },
    {
        id: 'editor.goto_line',
        label: 'Editor: Go to Line...',
        action: () => dispatchKeyEvent('g', true, false),
    },
];

// Combine all base commands
export const baseCommands: Command[] = [
    ...fileCommands,
    ...exportCommands,
    ...themeCommands,
    ...viewCommands,
    ...windowCommands,
    ...editorCommands,
];

// Re-export for convenience
export { openFileByPath };
