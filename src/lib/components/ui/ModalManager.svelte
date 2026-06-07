<script lang="ts">
import { type Command, commands } from '$lib/commands/commands';
import AboutModal from '$lib/components/ui/AboutModal.svelte';
import BookmarksModal from '$lib/components/ui/BookmarksModal.svelte';
import CommandPalette from '$lib/components/ui/CommandPalette.svelte';
import DataModal from '$lib/components/ui/DataModal.svelte';
import RecentFilesModal from '$lib/components/ui/RecentFilesModal.svelte';
import SettingsModal from '$lib/components/ui/SettingsModal.svelte';
import ShortcutsModal from '$lib/components/ui/ShortcutsModal.svelte';
import TextTransformModal from '$lib/components/ui/TextTransformModal.svelte';
import { getOperationsByCategory, OPERATION_CATEGORIES } from '$lib/config/textOperationsRegistry';
import { appState } from '$lib/stores/appState.svelte';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { openFileByPath } from '$lib/utils/fileSystem';

const textOpsWithCommands = new Set(['bold', 'italic', 'insert-link', 'strike', 'inline-code']);

const basePaletteCommands: Command[] = [
    ...commands.filter((c) => c.showInPalette !== false),
    ...OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id)
            .filter((op) => !textOpsWithCommands.has(op.id))
            .map((op) => ({
                id: `ops-${op.id}`,
                label: `${category.title === 'Text' ? 'Editor' : category.title}: ${op.label}`,
                category: category.title === 'Text' ? 'Editor' : category.title,
                handler: () => performTextTransform(op.id),
            })),
    ),
];

const paletteCommands = $derived.by(() => {
    void appState.commandPaletteSort;
    void appState.commandUsage;
    void appState.commandUsageCounts;

    const sorted = [...basePaletteCommands];

    if (appState.commandPaletteSort === 'alphabetical') {
        sorted.sort((a, b) => {
            const catA = a.category;
            const catB = b.category;
            if (catA !== catB) return catA.localeCompare(catB);
            return a.label.localeCompare(b.label);
        });
    } else if (appState.commandPaletteSort === 'recent') {
        sorted.sort((a, b) => {
            const timeA = appState.commandUsage[a.id] ?? 0;
            const timeB = appState.commandUsage[b.id] ?? 0;
            if (timeB !== timeA) return timeB - timeA;
            return a.label.localeCompare(b.label);
        });
    } else if (appState.commandPaletteSort === 'most-used') {
        sorted.sort((a, b) => {
            const countA = appState.commandUsageCounts[a.id] ?? 0;
            const countB = appState.commandUsageCounts[b.id] ?? 0;
            if (countB !== countA) return countB - countA;
            return a.label.localeCompare(b.label);
        });
    }

    return sorted;
});
</script>

<CommandPalette
    bind:isOpen={appContext.interface.showCommandPalette}
    commands={paletteCommands}
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

<DataModal
    bind:isOpen={appContext.interface.showData}
    onClose={() => (appContext.interface.showData = false)} />
