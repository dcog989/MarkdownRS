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
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--color-bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-fit max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);">
            <!-- Header -->
            <div class="flex items-center justify-between px-4 py-2 border-b" style="background-color: var(--color-bg-header); border-color: var(--color-border-light);">
                <div class="flex items-center gap-2">
                    <Keyboard size={16} style="color: var(--color-accent-secondary);" />
                    <h2 class="text-ui font-semibold shrink-0" style="color: var(--color-fg-default);">Keyboard Shortcuts</h2>
                </div>

                <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0" style="color: var(--color-fg-muted);" onclick={onClose} aria-label="Close Shortcuts">
                    <X size={16} />
                </button>
            </div>

            <!-- Shortcuts List -->
            <div class="flex-1 overflow-y-auto custom-scrollbar text-ui">
                {#if Object.keys(shortcutsByCategory).length > 0}
                    <div class="divide-y" style="border-color: var(--color-border-main);">
                        {#each Object.entries(shortcutsByCategory) as [category, shortcuts]}
                            <div class="px-4 py-3">
                                <h3 class="text-ui-sm font-bold uppercase tracking-widest mb-2" style="color: var(--color-accent-secondary);">
                                    {category}
                                </h3>
                                <div class="space-y-2">
                                    {#each shortcuts as shortcut}
                                        <div class="flex items-center justify-between group min-w-[440px]">
                                            <span style="color: var(--color-fg-default);">
                                                {shortcut.description}
                                            </span>
                                            <kbd class="px-2 py-0.5 rounded font-mono font-bold border" style="background-color: var(--color-bg-input); color: var(--color-fg-default); border-color: var(--color-border-main); font-size: 13px;">
                                                {shortcut.shortcut}
                                            </kbd>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="text-center py-12" style="color: var(--color-fg-muted);">
                        <p>No shortcuts registered</p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
