<script lang="ts">
    import { OPERATION_CATEGORIES, getOperationsByCategory } from '$lib/config/textOperationsRegistry';
    import { exportService } from '$lib/services/exportService';
    import { setTheme, toggleSplitView } from '$lib/stores/appState.svelte';
    import { addTab, performTextTransform } from '$lib/stores/editorStore.svelte';
    import {
        toggleAbout,
        toggleBookmarks,
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
    } from '$lib/utils/fileSystem';
    import { isMarkdownFile } from '$lib/utils/fileValidation';
    import { saveSettings } from '$lib/utils/settings';
    import { shortcutManager } from '$lib/utils/shortcuts';
    import { onMount } from 'svelte';
    import AboutModal from './AboutModal.svelte';
    import BookmarksModal from './BookmarksModal.svelte';
    import CommandPalette, { type Command } from './CommandPalette.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import ShortcutsModal from './ShortcutsModal.svelte';
    import TextTransformModal from './TextTransformModal.svelte';

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);

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
            label: 'File: Export to HTML',
            action: () => exportService.exportToHtml(),
        },
        {
            id: 'export-pdf',
            label: 'File: Export to PDF',
            action: () => exportService.exportToPdf(),
        },
        {
            id: 'export-png',
            label: 'File: Export to PNG',
            action: () => exportService.exportToImage('png'),
        },
        {
            id: 'format',
            label: 'Format: Format Document',
            action: () => performTextTransform('format-document'),
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
            label: 'Edit: Add Current to Bookmarks',
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
    ];

    const textOperationCommands: Command[] = OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id).map((op) => ({
            id: `ops-${op.id}`,
            label: `${category.title}: ${op.label}`,
            action: () => performTextTransform(op.id),
        })),
    );

    const commands = $derived(
        [...baseCommands, ...textOperationCommands]
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
            }),
    );

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
            else if (id === 'save') defaultKey = 'ctrl+s';
            else if (id === 'save-as') defaultKey = 'ctrl+shift+s';
            else if (id === 'close') defaultKey = 'ctrl+w';
            else if (id === 'format') defaultKey = 'shift+alt+f';
            else if (id === 'toggle-split') defaultKey = 'ctrl+\\';
            else if (id === 'bookmarks') defaultKey = 'ctrl+shift+b';
            else if (id === 'settings') defaultKey = 'ctrl+,';
            else if (id === 'shortcuts') defaultKey = 'f1';
            else if (id === 'transform') defaultKey = 'ctrl+t';
            else if (id === 'ops-bold') defaultKey = 'ctrl+b';
            else if (id === 'ops-italic') defaultKey = 'ctrl+i';
            else if (id === 'ops-insert-link') defaultKey = 'ctrl+k';
            else if (id === 'editor.bookmark_add') defaultKey = 'ctrl+d';

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
<SettingsModal
    bind:isOpen={appContext.interface.showSettings}
    onClose={() => (appContext.interface.showSettings = false)} />
<AboutModal bind:isOpen={appContext.interface.showAbout} onClose={() => (appContext.interface.showAbout = false)} />
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
