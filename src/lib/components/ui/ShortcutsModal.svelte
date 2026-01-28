<script lang="ts">
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { saveSettings } from '$lib/utils/settings';
    import { shortcutManager, type ShortcutDefinition } from '$lib/utils/shortcuts';
    import { Keyboard, RotateCcw, X } from 'lucide-svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let recordingCommandId = $state<string | null>(null);

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

    const categories = $derived.by(() => {
        const defs = shortcutManager.getDefinitions();
        const map = new SvelteMap<string, ShortcutDefinition[]>();
        defs.forEach((d) => {
            if (!map.has(d.category)) map.set(d.category, []);
            map.get(d.category)!.push(d);
        });
        return Array.from(map.entries());
    });
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Keyboard size={16} class="text-accent-secondary" />
            <h2 class="text-ui text-fg-default shrink-0 font-semibold">Keyboard Shortcuts</h2>
        </div>
        <button
            class="text-fg-muted hover-surface shrink-0 rounded p-1 transition-colors"
            onclick={onClose}>
            <X size={16} />
        </button>
    {/snippet}

    <div class="text-ui min-w-125 p-4">
        <div class="space-y-6">
            {#each categories as [category, defs] (category)}
                <div>
                    <h3
                        class="text-ui text-accent-secondary border-t-accent-secondary mb-2 border-b pb-1 font-bold tracking-widest uppercase">
                        {category}
                    </h3>
                    <div class="divide-border-main/30 divide-y">
                        {#each defs as def, index (def.command)}
                            <div
                                class="group flex items-center justify-between py-2 {index % 2 === 1
                                    ? 'bg-row-even'
                                    : ''}">
                                <button
                                    class="text-fg-default hover:text-accent-secondary flex-1 cursor-pointer text-left transition-colors outline-none"
                                    onclick={() => startRecording(def.command)}>
                                    {def.description}
                                </button>
                                <div class="flex items-center gap-2">
                                    <button
                                        class="min-w-25 rounded border px-3 py-1 text-center font-mono text-sm transition-all
                                            {recordingCommandId === def.command
                                            ? 'bg-accent-primary border-accent-primary text-fg-inverse animate-pulse'
                                            : 'bg-bg-input text-fg-default bg-border-main hover:border-accent-secondary'}"
                                        onclick={() => startRecording(def.command)}>
                                        {recordingCommandId === def.command
                                            ? 'Press keys...'
                                            : shortcutManager.getShortcutDisplay(def.command)}
                                    </button>
                                    {#if appContext.app.customShortcuts[def.command]}
                                        <button
                                            class="text-fg-muted hover:text-accent-primary p-1 opacity-0 transition-all group-hover:opacity-100"
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
        </div>
    </div>
</Modal>
