<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { X } from "lucide-svelte";
    import type { Snippet } from "svelte";

    let {
        isOpen = $bindable(false),
        onClose,
        title,
        width = "500px",
        zIndex = 50,
        showCloseButton = true,
        position = "top",
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
        position?: "center" | "top";
        header?: Snippet;
        footer?: Snippet;
        children: Snippet;
    }>();

    let viewport = $state<HTMLDivElement>();
    let content = $state<HTMLDivElement>();

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
    <div class="ui-backdrop" class:pt-16={position === "top"} class:items-start={position === "top"} style="z-index: {zIndex};" onclick={handleBackdropClick}>
        <div class="ui-panel shadow-2xl" style="width: {width}; max-height: 85vh; display: flex; flex-direction: column;" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            {#if header || title}
                <div class="ui-header flex justify-between items-center">
                    {#if header}
                        {@render header()}
                    {:else}
                        <span class="text-sm font-semibold text-[var(--color-fg-default)]">{title}</span>
                    {/if}

                    {#if showCloseButton}
                        <button class="p-1 rounded hover:bg-white/10 transition-colors text-[var(--color-fg-muted)]" onclick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    {/if}
                </div>
            {/if}

            <!-- Body with Internal Scrollbar Logic -->
            <div class="flex-1 relative min-h-0 overflow-hidden flex flex-col">
                <div bind:this={viewport} class="flex-1 overflow-y-auto no-scrollbar">
                    <div bind:this={content} style="display: flow-root;">
                        {@render children()}
                    </div>
                </div>
                {#if viewport}
                    <CustomScrollbar {viewport} {content} />
                {/if}
            </div>

            <!-- Footer -->
            {#if footer}
                <div class="px-4 py-3 border-t flex justify-end gap-2 shrink-0 border-[var(--color-border-main)] bg-[var(--color-bg-panel)]">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .no-scrollbar {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
</style>
