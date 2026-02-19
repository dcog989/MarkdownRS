<script lang="ts">
    import { baseCommands, openFileByPath, type Command } from '$lib/commands/paletteCommands';
    import {
        OPERATION_CATEGORIES,
        getOperationsByCategory,
    } from '$lib/config/textOperationsRegistry';
    import { performTextTransform } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { shortcutManager } from '$lib/utils/shortcuts';
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
        .map((cmd) => ({ ...cmd, shortcut: '' }))
        .sort((a, b) => {
            const catA = a.label.split(':')[0].trim();
            const catB = b.label.split(':')[0].trim();
            if (catA !== catB) return catA.localeCompare(catB);
            return a.label.localeCompare(b.label);
        });

    // Palette command shortcut IDs that map to registerAllShortcuts command IDs
    const PALETTE_TO_SHORTCUT_ID: Record<string, string> = {
        new: 'file.new',
        open: 'file.open',
        'recent-files': 'nav.quickOpen',
        save: 'file.save',
        'save-as': 'file.saveAs',
        close: 'file.closeTab',
        'file.reopen_closed': 'edit.reopenClosedTab',
        'find.show': 'edit.find',
        'find.show_replace': 'edit.replace',
        'toggle-split': 'view.toggleSplitView',
        bookmarks: 'window.bookmarks',
        'command-palette': 'window.commandPalette',
        settings: 'help.settings',
        shortcuts: 'help.shortcuts',
        transform: 'window.transform',
        'ops-bold': 'markdown.bold',
        'ops-italic': 'markdown.italic',
        'ops-insert-link': 'markdown.link',
        'editor.bookmark_add': 'markdown.bookmark',
        'editor.toggle_comment': 'markdown.comment',
        'editor.duplicate_line': 'edit.duplicateLine',
        'editor.goto_line': 'edit.gotoLine',
    };

    const commands = $derived(
        sortedCommands.map((cmd) => {
            const shortcutId = PALETTE_TO_SHORTCUT_ID[cmd.id] ?? cmd.id;
            return { ...cmd, shortcut: shortcutManager.getShortcutDisplay(shortcutId) };
        }),
    );
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
