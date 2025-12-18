<script lang="ts">
    import { X } from "lucide-svelte";
    import type { Snippet } from "svelte";

    let {
        isOpen = $bindable(false),
        onClose,
        title,
        width = "500px",
        zIndex = 50,
        showCloseButton = true,
        header,
        footer,
        children,
    } = $props<{
        isOpen: boolean;
        onClose: () => void;
        title?: string;
        width?: string;
        zIndex?: number;
        showCloseButton?: boolean;
        header?: Snippet;
        footer?: Snippet;
        children: Snippet;
    }>();

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isOpen && e.key === "Escape") {
            e.stopPropagation();
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 flex items-center justify-center p-4" style="background-color: var(--bg-backdrop); z-index: {zIndex};" onclick={handleBackdropClick}>
        <div class="shadow-2xl rounded-lg border overflow-hidden flex flex-col max-h-[90vh]" style="background-color: var(--bg-panel); border-color: var(--border-light); width: {width};" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            {#if header || title}
                <div class="px-4 py-3 border-b flex justify-between items-center shrink-0" style="background-color: var(--bg-header); border-color: var(--border-main);">
                    {#if header}
                        {@render header()}
                    {:else}
                        <span class="text-sm font-semibold" style="color: var(--fg-default)">{title}</span>
                    {/if}

                    {#if showCloseButton}
                        <button class="p-1 rounded hover:bg-white/10 transition-colors" style="color: var(--fg-muted);" onclick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    {/if}
                </div>
            {/if}

            <!-- Body -->
            <div class="flex-1 overflow-y-auto custom-scrollbar">
                {@render children()}
            </div>

            <!-- Footer -->
            {#if footer}
                <div class="px-4 py-3 border-t flex justify-end gap-2 shrink-0" style="background-color: var(--bg-panel); border-color: var(--border-main);">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
