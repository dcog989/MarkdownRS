<script lang="ts">
    import {
        OPERATION_CATEGORIES,
        getOperationsByCategory,
    } from '$lib/config/textOperationsRegistry';
    import { exportService } from '$lib/services/exportService';
    import { setTheme, toggleSplitView } from '$lib/stores/appState.svelte';
    import { addTab, performTextTransform } from '$lib/stores/editorStore.svelte';
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
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { showToast } from '$lib/stores/toastStore.svelte';
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
    import { shortcutManager } from '$lib/utils/shortcuts';
    import { onMount } from 'svelte';
    import AboutModal from './AboutModal.svelte';
    import BookmarksModal from './BookmarksModal.svelte';
    import CommandPalette, { type Command } from './CommandPalette.svelte';
    import RecentFilesModal from './RecentFilesModal.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import ShortcutsModal from './ShortcutsModal.svelte';
    import TextTransformModal from './TextTransformModal.svelte';

    let activeTab = $derived(
        appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId),
    );
    let isMarkdown = $derived(
        activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true,
    );
    let shortcutsRegistered = $state(false);

    function toggleSplit() {
        if (!isMarkdown) {
            showToast('warning', 'Preview not available for this file type');
            return;
        }
        toggleSplitView();
        saveSettings();
    }

    const baseCommands: Command[] = [
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
            action: async () => {
                await openFile();
            },
        },
        {
            id: 'recent-files',
            label: 'File: Recent Files...',
            action: () => toggleRecentFiles(),
        },
        {
            id: 'save',
            label: 'File: Save',
            action: async () => {
                await saveCurrentFile();
            },
        },
        {
            id: 'save-as',
            label: 'File: Save As...',
            action: async () => {
                await saveCurrentFileAs();
            },
        },
        {
            id: 'close',
            label: 'File: Close Tab',
            action: async () => {
                if (appContext.app.activeTabId) await requestCloseTab(appContext.app.activeTabId);
            },
        },
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
        {
            id: 'toggle-split',
            label: 'View: Toggle Split Preview',
            action: () => toggleSplit(),
        },
        {
            id: 'toggle-whitespace',
            label: 'View: Toggle Whitespace',
            action: () => {
                appContext.app.showWhitespace = !appContext.app.showWhitespace;
                saveSettings();
            },
        },
        {
            id: 'bookmarks',
            label: 'Window: Bookmarks',
            action: () => toggleBookmarks(),
        },
        {
            id: 'command-palette',
            label: 'Window: Command Palette',
            action: () => toggleCommandPalette(),
        },
        {
            id: 'settings',
            label: 'Window: Settings',
            action: () => toggleSettings(),
        },
        {
            id: 'shortcuts',
            label: 'Window: Keyboard Shortcuts',
            action: () => toggleShortcuts(),
        },
        {
            id: 'transform',
            label: 'Window: Text Transformations',
            action: () => toggleTransform(),
        },
        {
            id: 'about',
            label: 'Window: About',
            action: () => toggleAbout(),
        },
        {
            id: 'editor.bookmark_add',
            label: 'File: Add Current to Bookmarks',
            action: async () => {
                const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
                if (tab?.path) {
                    const { addBookmark } = await import('$lib/stores/bookmarkStore.svelte');
                    await addBookmark(tab.path, tab.title);
                    showToast('success', `Added "${tab.title}" to bookmarks`);
                } else {
                    showToast('warning', 'Save the file before bookmarking');
                }
            },
        },
        {
            id: 'editor.toggle_comment',
            label: 'Editor: Toggle Line Comment',
            action: () => {
                // Trigger the keyboard shortcut for toggle comment
                const event = new KeyboardEvent('keydown', {
                    key: '/',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                });
                document.activeElement?.dispatchEvent(event);
            },
        },
        {
            id: 'find.show',
            label: 'Editor: Find',
            action: () => openFind(),
        },
        {
            id: 'find.show_replace',
            label: 'Editor: Replace',
            action: () => openReplace(),
        },
        {
            id: 'file.reopen_closed',
            label: 'File: Reopen Last Closed Tab',
            action: async () => {
                triggerReopenClosedTab(0);
            },
        },
        {
            id: 'editor.duplicate_line',
            label: 'Editor: Duplicate Line/Selection',
            action: () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'd',
                    ctrlKey: true,
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true,
                });
                document.activeElement?.dispatchEvent(event);
            },
        },
        {
            id: 'editor.goto_line',
            label: 'Editor: Go to Line...',
            action: () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'g',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                });
                document.activeElement?.dispatchEvent(event);
            },
        },
    ];

    const textOperationCommands: Command[] = OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id).map((op) => ({
            id: `ops-${op.id}`,
            label: `${category.title}: ${op.label}`,
            action: () => performTextTransform(op.id),
        })),
    );

    const commands = $derived.by(() => {
        // Dependency on shortcutsRegistered to force re-calculation after mount
        void shortcutsRegistered;

        return [...baseCommands, ...textOperationCommands]
            .map((cmd) => ({
                ...cmd,
                shortcut: shortcutManager.getShortcutDisplay(cmd.id),
            }))
            .sort((a, b) => {
                const catA = a.label.split(':')[0].trim();
                const catB = b.label.split(':')[0].trim();
                if (catA !== catB) {
                    return catA.localeCompare(catB);
                }
                return a.label.localeCompare(b.label);
            });
    });

    function registerShortcuts() {
        // Load custom mappings from app state
        shortcutManager.setCustomMappings(appContext.app.customShortcuts);

        // We register ALL commands from the palette list to ensure parity
        // This includes File ops, UI toggles, and all Text Operations
        commands.forEach((cmd) => {
            // Determine default key based on the command ID
            let defaultKey = '';
            const id = cmd.id;

            // Mapping IDs to VS Code style defaults
            if (id === 'new') defaultKey = 'ctrl+n';
            else if (id === 'open') defaultKey = 'ctrl+o';
            else if (id === 'recent-files') defaultKey = 'ctrl+p';
            else if (id === 'save') defaultKey = 'ctrl+s';
            else if (id === 'save-as') defaultKey = 'ctrl+shift+s';
            else if (id === 'close') defaultKey = 'ctrl+w';
            else if (id === 'format') defaultKey = 'shift+alt+f';
            else if (id === 'toggle-split') defaultKey = 'ctrl+\\';
            else if (id === 'bookmarks') defaultKey = 'ctrl+shift+b';
            else if (id === 'command-palette') defaultKey = 'ctrl+shift+p';
            else if (id === 'settings') defaultKey = 'ctrl+,';
            else if (id === 'shortcuts') defaultKey = 'f1';
            else if (id === 'transform') defaultKey = 'ctrl+t';
            else if (id === 'ops-bold') defaultKey = 'ctrl+b';
            else if (id === 'ops-italic') defaultKey = 'ctrl+i';
            else if (id === 'ops-insert-link') defaultKey = 'ctrl+k';
            else if (id === 'editor.bookmark_add') defaultKey = 'ctrl+d';
            else if (id === 'editor.toggle_comment') defaultKey = 'ctrl+/';
            else if (id === 'find.show') defaultKey = 'ctrl+f';
            else if (id === 'find.show_replace') defaultKey = 'ctrl+h';
            else if (id === 'file.reopen_closed') defaultKey = 'ctrl+shift+t';
            else if (id === 'editor.duplicate_line') defaultKey = 'ctrl+shift+d';
            else if (id === 'editor.goto_line') defaultKey = 'ctrl+g';
            else if (id === 'ops-format-document') defaultKey = 'shift+alt+f';

            const parts = cmd.label.split(':');
            const category = parts[0].trim();
            const description = parts[1]?.trim() || parts[0].trim();

            shortcutManager.register({
                id: cmd.id,
                command: cmd.id,
                defaultKey: defaultKey,
                category: category,
                description: description,
                handler: async () => {
                    await cmd.action();
                },
            });
        });

        // Explicitly register Reopen Last Closed as it might not be in the palette list displayed above (but logically fits)
        // We'll add it here for keyboard shortcut support
        shortcutManager.register({
            id: 'reopen-closed-tab',
            command: 'reopen-closed-tab',
            defaultKey: 'ctrl+shift+t',
            category: 'File',
            description: 'Reopen Last Closed Tab',
            handler: async () => {
                triggerReopenClosedTab(0);
            },
        });

        shortcutsRegistered = true;
    }

    onMount(() => {
        registerShortcuts();
        return () => {
            shortcutManager.clear();
        };
    });
</script>

<CommandPalette
    bind:isOpen={appContext.interface.showCommandPalette}
    {commands}
    onClose={() => (appContext.interface.showCommandPalette = false)} />
<RecentFilesModal
    bind:isOpen={appContext.interface.showRecentFiles}
    onClose={() => (appContext.interface.showRecentFiles = false)} />
<SettingsModal
    bind:isOpen={appContext.interface.showSettings}
    onClose={() => (appContext.interface.showSettings = false)} />
<AboutModal
    bind:isOpen={appContext.interface.showAbout}
    onClose={() => (appContext.interface.showAbout = false)} />
<BookmarksModal
    bind:isOpen={appContext.interface.showBookmarks}
    onClose={() => (appContext.interface.showBookmarks = false)}
    onOpenFile={(path) => openFileByPath(path)} />
<TextTransformModal
    isOpen={appContext.interface.showTransform}
    onClose={() => (appContext.interface.showTransform = false)} />
<ShortcutsModal
    bind:isOpen={appContext.interface.showShortcuts}
    onClose={() => (appContext.interface.showShortcuts = false)} />
