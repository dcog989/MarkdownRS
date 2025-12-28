<script lang="ts">
    import { Keyboard, X } from "lucide-svelte";
    import Modal from "./Modal.svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    const shortcutsByCategory = {
        File: [
            { description: "Create new file", shortcut: "Ctrl+N" },
            { description: "Open file", shortcut: "Ctrl+O" },
            { description: "Save file", shortcut: "Ctrl+S" },
            { description: "Close tab", shortcut: "Ctrl+W" },
            { description: "Cycle tabs (sequential)", shortcut: "Ctrl+Tab" },
            { description: "Cycle tabs backward", shortcut: "Ctrl+Shift+Tab" },
        ],
        Edit: [
            { description: "Format document", shortcut: "Shift+Alt+F" },
            { description: "Text transformations", shortcut: "Ctrl+T" },
            { description: "Add to dictionary", shortcut: "F8" },
            { description: "Jump to start", shortcut: "Ctrl+Home" },
            { description: "Jump to end", shortcut: "Ctrl+End" },
            { description: "Toggle insert/overwrite", shortcut: "Insert" },
        ],
        View: [
            { description: "Toggle split preview", shortcut: "Ctrl+\\" },
            { description: "Command palette", shortcut: "Ctrl+P" },
            { description: "Bookmarks", shortcut: "Ctrl+B" },
        ],
        Help: [
            { description: "Keyboard shortcuts", shortcut: "F1" },
            { description: "Settings", shortcut: "Ctrl+," },
        ],
    };
</script>

<Modal bind:isOpen {onClose} width="auto" showCloseButton={false}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Keyboard size={16} class="text-accent-secondary" />
            <h2 class="text-ui font-semibold shrink-0 text-fg-default">Keyboard Shortcuts</h2>
        </div>
        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 text-fg-muted" onclick={onClose} aria-label="Close Shortcuts">
            <X size={16} />
        </button>
    {/snippet}

    <div class="text-ui min-w-[400px]">
        {#if Object.keys(shortcutsByCategory).length > 0}
            <div class="divide-y border-border-main">
                {#each Object.entries(shortcutsByCategory) as [category, shortcuts]}
                    <div class="px-4 py-3">
                        <h3 class="text-ui-sm font-bold uppercase tracking-widest mb-2 text-accent-secondary">
                            {category}
                        </h3>
                        <div class="space-y-2">
                            {#each shortcuts as shortcut}
                                <div class="flex items-center justify-between group gap-8">
                                    <span class="text-fg-default">
                                        {shortcut.description}
                                    </span>
                                    <kbd class="px-2 py-0.5 rounded font-mono font-bold border shrink-0 bg-bg-input text-fg-default border-border-main text-[13px]">
                                        {shortcut.shortcut}
                                    </kbd>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="text-center py-12 text-fg-muted">
                <p>No shortcuts registered</p>
            </div>
        {/if}
    </div>
</Modal>
