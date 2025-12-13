<script lang="ts">
    import { Keyboard, X } from "lucide-svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    // Manually defined shortcuts for display
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
            { description: "Search commands", shortcut: "Ctrl+Shift+P" },
            { description: "Command palette", shortcut: "Ctrl+P" },
        ],
        Help: [
            { description: "Keyboard shortcuts", shortcut: "F1" },
            { description: "Settings", shortcut: "Click gear icon" },
        ],
    };

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && isOpen) {
            e.preventDefault();
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-[800px] max-h-[85vh] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--bg-panel); border-color: var(--border-light);">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b" style="background-color: var(--bg-header); border-color: var(--border-light);">
                <div class="flex items-center gap-3">
                    <Keyboard size={20} style="color: var(--accent-secondary);" />
                    <h2 class="text-lg font-semibold" style="color: var(--fg-default);">Keyboard Shortcuts</h2>
                </div>

                <button class="p-1.5 rounded hover:bg-white/10 transition-colors" style="color: var(--fg-muted);" onclick={onClose} aria-label="Close Shortcuts">
                    <X size={20} />
                </button>
            </div>

            <!-- Shortcuts List -->
            <div class="flex-1 overflow-y-auto px-6 py-4">
                {#if Object.keys(shortcutsByCategory).length > 0}
                    {#each Object.entries(shortcutsByCategory) as [category, shortcuts]}
                        <div class="mb-6 last:mb-0">
                            <h3 class="text-sm font-semibold mb-3 uppercase tracking-wide" style="color: var(--accent-secondary);">
                                {category}
                            </h3>
                            <div class="space-y-2">
                                {#each shortcuts as shortcut}
                                    <div class="flex items-center justify-between py-2 px-3 rounded hover:bg-white/5 transition-colors">
                                        <span class="text-sm" style="color: var(--fg-default);">
                                            {shortcut.description}
                                        </span>
                                        <kbd class="px-3 py-1.5 rounded text-xs font-mono font-semibold" style="background-color: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border-main);">
                                            {shortcut.shortcut}
                                        </kbd>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                {:else}
                    <div class="text-center py-12" style="color: var(--fg-muted);">
                        <p class="text-sm">No shortcuts registered</p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
