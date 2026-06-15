<script lang="ts">
import { ArrowUpDown, Zap } from 'lucide-svelte';
import { tick } from 'svelte';
import type { Command } from '$lib/commands/commands';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { appState } from '$lib/stores/appState.svelte';
import { createListNavigation } from '$lib/utils/listNavigation.svelte';
import { scrollIntoView } from '$lib/utils/modalUtils';
import { shortcutManager } from '$lib/utils/shortcuts';

let {
    isOpen = $bindable(false),
    commands = [],
    onClose,
} = $props<{
    isOpen: boolean;
    commands: Command[];
    onClose?: () => void;
}>();

let query = $state('');
let inputRef: HTMLInputElement | undefined = $state();

let filteredCommands = $derived(
    commands.filter((c: Command) => c.label.toLowerCase().includes(query.toLowerCase())),
);

const nav = createListNavigation(
    () => filteredCommands.length,
    (index) => execute(filteredCommands[index]),
);

$effect(() => {
    if (isOpen) {
        query = '';
        nav.reset();
        tick().then(() => inputRef?.focus());
    }
});

function execute(command: Command) {
    if (!command) return;
    command.handler?.();
    appState.commandUsage[command.id] = Date.now();
    appState.commandUsageCounts[command.id] = (appState.commandUsageCounts[command.id] ?? 0) + 1;
    close();
}

const SORT_LABELS: Record<string, string> = {
    alphabetical: 'A-Z',
    recent: 'Recent',
    'most-used': 'Most Used',
};

function cycleSortMode() {
    const modes: Array<'alphabetical' | 'recent' | 'most-used'> = ['alphabetical', 'recent', 'most-used'];
    const idx = modes.indexOf(appState.commandPaletteSort);
    appState.commandPaletteSort = modes[(idx + 1) % modes.length];
}

function close() {
    isOpen = false;
    if (onClose) onClose();
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Commands"
            icon={Zap}
            bind:searchValue={query}
            bind:inputRef
            searchPlaceholder="Search Commands..."
            onClose={close}
            onKeydown={nav.handleKeydown}>
            {#snippet extraActions()}
                <button
                    type="button"
                    class="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-fg-muted transition-colors outline-none hover-surface"
                    title={appState.commandPaletteSort}
                    onclick={cycleSortMode}>
                    <ArrowUpDown size={14} />
                    {SORT_LABELS[appState.commandPaletteSort]}
                </button>
            {/snippet}
        </ModalSearchHeader>
    {/snippet}

    <div class="py-1">
        {#if filteredCommands.length > 0}
            {#each filteredCommands as command, index (command.id)}
                <button
                    type="button"
                    class="command-item text-ui flex w-full items-center justify-between px-3 py-2 text-left outline-none {index %
                        2 ===
                    1
                        ? 'bg-row-even'
                        : ''}"
                    style="
                        background-color: {index === nav.selectedIndex
                        ? 'var(--color-accent-primary)'
                        : index % 2 === 1
                          ? 'var(--surface-row)'
                          : 'transparent'};
                        color: {index === nav.selectedIndex
                        ? 'var(--color-fg-inverse)'
                        : 'var(--color-fg-default)'};
                    "
                    use:scrollIntoView={index === nav.selectedIndex}
                    onmouseenter={() => nav.select(index)}
                    onclick={() => execute(command)}>
                    <span>{command.label}</span>
                    {#if shortcutManager.getShortcutDisplay(command.id)}
                        <span class="text-ui-sm opacity-60">{shortcutManager.getShortcutDisplay(command.id)}</span>
                    {/if}
                </button>
            {/each}
        {:else}
            <div class="text-ui text-fg-muted px-3 py-2">No commands found</div>
        {/if}
    </div>
</Modal>
