<script lang="ts">
import { Keyboard, RotateCcw } from 'lucide-svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { Command } from '$lib/commands/commands';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { saveSettings } from '$lib/utils/settings';
import { shortcutManager } from '$lib/utils/shortcuts';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

let searchQuery = $state('');
let searchInputEl = $state<HTMLInputElement>();
let selectedIndex = $state(0);
let recordingCommandId = $state<string | null>(null);
let conflictCommand = $state<{ command: Command; key: string; targetId: string } | null>(null);

$effect(() => {
    if (isOpen) {
        searchQuery = '';
        selectedIndex = 0;
        // Focus is handled automatically by the Modal component
        // which focuses the first focusable element (the search input)
    }
});

$effect(() => {
    void searchQuery;
    selectedIndex = 0;
});

function startRecording(commandId: string) {
    recordingCommandId = commandId;
    shortcutManager.setEnabled(false);
    window.addEventListener('keydown', handleRecordKey, { capture: true });
}

function handleRecordKey(e: KeyboardEvent) {
    if (!recordingCommandId) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
        stopRecording();
        return;
    }

    // Don't record if only modifiers are pressed
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (e.metaKey) parts.push('meta');
    parts.push(e.key.toLowerCase());

    const keyStr = parts.join('+');

    const conflict = shortcutManager.findCommandByShortcut(keyStr, recordingCommandId);
    if (conflict) {
      conflictCommand = { command: conflict, key: keyStr, targetId: recordingCommandId };
      stopRecording();
      return;
    }

    assignShortcut(recordingCommandId, keyStr);
}

function assignShortcut(commandId: string, key: string) {
  appContext.app.customShortcuts[commandId] = key;
  shortcutManager.setCustomMappings(appContext.app.customShortcuts);
  saveSettings();
  stopRecording();
}

function handleReassign() {
  if (!conflictCommand) return;
  delete appContext.app.customShortcuts[conflictCommand.command.id];
  assignShortcut(conflictCommand.targetId, conflictCommand.key);
  conflictCommand = null;
}

function handleCancelConflict() {
  conflictCommand = null;
}

function stopRecording() {
    recordingCommandId = null;
    window.removeEventListener('keydown', handleRecordKey, { capture: true });
    shortcutManager.setEnabled(true);
}

function resetShortcut(commandId: string) {
    delete appContext.app.customShortcuts[commandId];
    shortcutManager.setCustomMappings(appContext.app.customShortcuts);
    saveSettings();
}

function scrollIntoView(node: HTMLElement, isSelected: boolean) {
    if (isSelected) {
        node.scrollIntoView({ block: 'nearest' });
    }
    return {
        update(newIsSelected: boolean) {
            if (newIsSelected) {
                node.scrollIntoView({ block: 'nearest' });
            }
        },
    };
}

const allShortcuts = $derived(shortcutManager.getDefinitions());

const filteredShortcuts = $derived(
    allShortcuts.filter((def) => {
        if (searchQuery.length < 1) return true;
        const query = searchQuery.toLowerCase();
        const descriptionMatch = def.label.toLowerCase().includes(query);
        const categoryMatch = def.category.toLowerCase().includes(query);
        const commandMatch = def.id.toLowerCase().includes(query);
        const shortcutMatch = shortcutManager
            .getShortcutDisplay(def.id)
            .toLowerCase()
            .includes(query);
        return descriptionMatch || categoryMatch || commandMatch || shortcutMatch;
    }),
);

const categories = $derived.by(() => {
    const map = new SvelteMap<string, Command[]>();
    filteredShortcuts.forEach((def) => {
        if (!map.has(def.category)) map.set(def.category, []);
        map.get(def.category)?.push(def);
    });
    return Array.from(map.entries());
});

// Create a flat array for proper indexing with selectedIndex
const flatShortcuts = $derived(categories.flatMap(([, defs]) => defs));

function handleKeydown(e: KeyboardEvent) {
    // Only handle navigation keys - let all other keys (including typing) work normally
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        return;
    }

    if (filteredShortcuts.length === 0) return;

    e.preventDefault();

    if (e.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % filteredShortcuts.length;
    } else if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + filteredShortcuts.length) % filteredShortcuts.length;
    } else if (e.key === 'Enter') {
        const def = flatShortcuts[selectedIndex];
        if (def) {
            startRecording(def.id);
        }
    }
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Keyboard Shortcuts"
            icon={Keyboard}
            bind:searchValue={searchQuery}
            bind:inputRef={searchInputEl}
            searchPlaceholder="Search shortcuts..."
            {onClose}
            onKeydown={handleKeydown} />
    {/snippet}

    <div class="text-ui min-w-125 p-4 relative">
        {#if conflictCommand}
            {@const conflict = conflictCommand}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
                onclick={handleCancelConflict}>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                    class="bg-bg-panel border-border-main mx-4 w-80 rounded-lg border p-5 shadow-xl"
                    onclick={(e) => e.stopPropagation()}>
                    <h3 class="text-fg-default mb-2 text-sm font-semibold">Shortcut Conflict</h3>
                    <p class="text-fg-muted mb-4 text-sm leading-relaxed">
                        <span class="text-fg-default font-mono text-xs">{conflict.key}</span>
                        is already assigned to <strong>{conflict.command.label}</strong>.
                        Reassign it to <strong>{shortcutManager.getDefinitions().find((c) => c.id === conflict.targetId)?.label}</strong>?
                    </p>
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            class="btn-base btn-sm btn-secondary"
                            onclick={handleCancelConflict}>Cancel</button>
                        <button
                            type="button"
                            class="btn-base btn-sm"
                            onclick={handleReassign}>Reassign</button>
                    </div>
                </div>
            </div>
        {/if}
        <div class="space-y-6">
            {#if filteredShortcuts.length > 0}
                {@const globalIndex = { value: -1 }}
                {#each categories as [ category, defs ] (category)}
                    <div>
                        <h3
                            class="text-ui text-accent-secondary border-t-accent-secondary mb-2 border-b pb-1 font-bold tracking-widest uppercase">
                            {category}
                        </h3>
                        <div class="divide-border-main/30 divide-y">
                            {#each defs as def (def.id)}
                                {@const currentIndex = ++globalIndex.value}
                                {@const isSelected = currentIndex === selectedIndex}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div
                                    class="group flex items-center justify-between py-2 px-2 -mx-2 rounded transition-colors"
                                    style:background-color={isSelected
                                        ? 'var(--color-accent-primary)'
                                        : currentIndex % 2 === 1
                                          ? 'var(--surface-row)'
                                          : 'transparent'}
                                    use:scrollIntoView={isSelected}
                                    onmouseenter={() => (selectedIndex = currentIndex)}>
                                    <button
                                        type="button"
                                        class="flex-1 cursor-pointer text-left transition-colors outline-none"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-default)'}
                                        onclick={() => startRecording(def.id)}>
                                        {def.label}
                                    </button>
                                    <div class="flex items-center gap-2">
                                        <button
                                            type="button"
                                            class="min-w-25 rounded border px-3 py-1 text-center font-mono text-sm transition-all
												{recordingCommandId === def.id
                                                ? 'bg-accent-primary border-accent-primary text-fg-inverse animate-pulse'
                                                : isSelected
                                                  ? 'bg-fg-inverse/20 border-fg-inverse/30 text-fg-inverse'
                                                  : 'bg-bg-input text-fg-default bg-border-main hover:border-accent-secondary'}"
                                            onclick={() => startRecording(def.id)}>
                                            {recordingCommandId === def.id
                                                ? 'Press keys...'
                                                : shortcutManager.getShortcutDisplay(def.id)}
                                        </button>
                                        {#if appContext.app.customShortcuts[def.id]}
                                            <button
                                                type="button"
                                                class="p-1 transition-all opacity-0 group-hover:opacity-100"
                                                style:color={isSelected
                                                    ? 'var(--color-fg-inverse)'
                                                    : 'var(--color-accent-primary)'}
                                                onclick={() => resetShortcut(def.id)}
                                                title="Reset to default">
                                                <RotateCcw size={14} />
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            {:else if searchQuery.length >= 1}
                <div class="text-fg-muted px-4 py-8 text-center">
                    No shortcuts match your search
                </div>
            {:else}
                <div class="text-fg-muted px-4 py-8 text-center">
                    <Keyboard size={48} class="mx-auto mb-2 opacity-30" />
                    <div>No shortcuts available</div>
                </div>
            {/if}
        </div>
    </div>
</Modal>
