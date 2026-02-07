<script lang="ts">
    import { baseCommands, openFileByPath, type Command } from '$lib/commands/paletteCommands';
    import {
        OPERATION_CATEGORIES,
        getOperationsByCategory,
    } from '$lib/config/textOperationsRegistry';
    import { performTextTransform } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { triggerReopenClosedTab } from '$lib/utils/fileSystem';
    import { shortcutManager } from '$lib/utils/shortcuts';
    import { onMount } from 'svelte';
    import AboutModal from './AboutModal.svelte';
    import BookmarksModal from './BookmarksModal.svelte';
    import CommandPalette from './CommandPalette.svelte';
    import RecentFilesModal from './RecentFilesModal.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import ShortcutsModal from './ShortcutsModal.svelte';
    import TextTransformModal from './TextTransformModal.svelte';

    const textOperationCommands: Command[] = OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id).map((op) => ({
            id: `ops-${op.id}`,
            label: `${category.title}: ${op.label}`,
            action: () => performTextTransform(op.id),
        })),
    );

    const allCommands = [...baseCommands, ...textOperationCommands];

    const sortedCommands = allCommands
        .map((cmd) => ({
            ...cmd,
            shortcut: '',
        }))
        .sort((a, b) => {
            const catA = a.label.split(':')[0].trim();
            const catB = b.label.split(':')[0].trim();
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            return a.label.localeCompare(b.label);
        });

    const commands = $derived.by(() => {
        return sortedCommands.map((cmd) => ({
            ...cmd,
            shortcut: shortcutManager.getShortcutDisplay(cmd.id),
        }));
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
    position="top"
    onClose={() => (appContext.interface.showAbout = false)} />
<BookmarksModal
    bind:isOpen={appContext.interface.showBookmarks}
    position="top"
    onClose={() => (appContext.interface.showBookmarks = false)}
    onOpenFile={(path) => openFileByPath(path)} />
<TextTransformModal
    isOpen={appContext.interface.showTransform}
    onClose={() => (appContext.interface.showTransform = false)} />
<ShortcutsModal
    bind:isOpen={appContext.interface.showShortcuts}
    onClose={() => (appContext.interface.showShortcuts = false)} />
