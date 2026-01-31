<script lang="ts">
    import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { saveSettings } from '$lib/utils/settings';
    import { shortcutManager, type ShortcutDefinition } from '$lib/utils/shortcuts';
    import { scrollIntoView } from '$lib/utils/modalUtils';
    import { Keyboard, RotateCcw } from 'lucide-svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state('');
    let searchInputEl = $state<HTMLInputElement>();
    let selectedIndex = $state(0);
    let recordingCommandId = $state<string | null>(null);

    $effect(() => {
        if (isOpen) {
            searchQuery = '';
            selectedIndex = 0;
            setTimeout(() => searchInputEl?.focus(), 0);
        }
    });

    $effect(() => {
        void searchQuery;
        selectedIndex = 0;
    });

    function startRecording(commandId: string) {
        recordingCommandId = commandId;
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

        appContext.app.customShortcuts[recordingCommandId] = keyStr;
        shortcutManager.setCustomMappings(appContext.app.customShortcuts);
        saveSettings();
        stopRecording();
    }

    function stopRecording() {
        recordingCommandId = null;
        window.removeEventListener('keydown', handleRecordKey, { capture: true });
    }

    function resetShortcut(commandId: string) {
        delete appContext.app.customShortcuts[commandId];
        shortcutManager.setCustomMappings(appContext.app.customShortcuts);
        saveSettings();
    }

    const allShortcuts = $derived(shortcutManager.getDefinitions());

    const filteredShortcuts = $derived(
        allShortcuts.filter((def) => {
            if (searchQuery.length < 1) return true;
            const query = searchQuery.toLowerCase();
            const descriptionMatch = def.description.toLowerCase().includes(query);
            const categoryMatch = def.category.toLowerCase().includes(query);
            const commandMatch = def.command.toLowerCase().includes(query);
            const shortcutMatch = shortcutManager
                .getShortcutDisplay(def.command)
                .toLowerCase()
                .includes(query);
            return descriptionMatch || categoryMatch || commandMatch || shortcutMatch;
        }),
    );

    const categories = $derived.by(() => {
        const map = new SvelteMap<string, ShortcutDefinition[]>();
        filteredShortcuts.forEach((def) => {
            if (!map.has(def.category)) map.set(def.category, []);
            map.get(def.category)!.push(def);
        });
        return Array.from(map.entries());
    });

    // Create a flat array for proper indexing with selectedIndex
    const flatShortcuts = $derived(categories.flatMap(([, defs]) => defs));

    function handleKeydown(e: KeyboardEvent) {
        // Only handle navigation keys
        if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
            return;
        }

        if (filteredShortcuts.length === 0) return;

        // If the search input is focused and user presses Enter, don't prevent default
        // to allow the input to handle it normally (unless we want to trigger recording)
        const isInputFocused = document.activeElement === searchInputEl;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredShortcuts.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex =
                (selectedIndex - 1 + filteredShortcuts.length) % filteredShortcuts.length;
        } else if (e.key === 'Enter') {
            // Only trigger recording if input is not focused or if explicitly navigating
            if (!isInputFocused) {
                e.preventDefault();
                const def = flatShortcuts[selectedIndex];
                if (def) {
                    startRecording(def.command);
                }
            }
            // If input is focused, let Enter work normally (blur or submit)
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

    <div class="text-ui min-w-125 p-4">
        <div class="space-y-6">
            {#if filteredShortcuts.length > 0}
                {@const globalIndex = { value: -1 }}
                {#each categories as [category, defs] (category)}
                    <div>
                        <h3
                            class="text-ui text-accent-secondary border-t-accent-secondary mb-2 border-b pb-1 font-bold tracking-widest uppercase">
                            {category}
                        </h3>
                        <div class="divide-border-main/30 divide-y">
                            {#each defs as def (def.command)}
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
                                    tabindex="-1"
                                    onmouseenter={() => (selectedIndex = currentIndex)}>
                                    <button
                                        class="flex-1 cursor-pointer text-left transition-colors outline-none"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-default)'}
                                        onclick={() => startRecording(def.command)}>
                                        {def.description}
                                    </button>
                                    <div class="flex items-center gap-2">
                                        <button
                                            class="min-w-25 rounded border px-3 py-1 text-center font-mono text-sm transition-all
												{recordingCommandId === def.command
                                                ? 'bg-accent-primary border-accent-primary text-fg-inverse animate-pulse'
                                                : isSelected
                                                  ? 'bg-fg-inverse/20 border-fg-inverse/30 text-fg-inverse'
                                                  : 'bg-bg-input text-fg-default bg-border-main hover:border-accent-secondary'}"
                                            onclick={() => startRecording(def.command)}>
                                            {recordingCommandId === def.command
                                                ? 'Press keys...'
                                                : shortcutManager.getShortcutDisplay(def.command)}
                                        </button>
                                        {#if appContext.app.customShortcuts[def.command]}
                                            <button
                                                class="p-1 transition-all opacity-0 group-hover:opacity-100"
                                                style:color={isSelected
                                                    ? 'var(--color-fg-inverse)'
                                                    : 'var(--color-accent-primary)'}
                                                onclick={() => resetShortcut(def.command)}
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
