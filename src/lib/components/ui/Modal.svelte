<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { MODAL_CONSTRAINTS } from "$lib/config/modalSizes";
    import { X } from "lucide-svelte";
    import type { Snippet } from "svelte";

    let {
        isOpen = $bindable(false),
        onClose,
        title,
        zIndex = 50,
        position = "top",
        header,
        footer,
        children,
    } = $props<{
        isOpen: boolean;
        onClose: () => void;
        title?: string;
        zIndex?: number;
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
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }

    function handleFocusTrap(e: FocusEvent) {
        if (!isOpen) return;
        const modal = (e.target as HTMLElement)?.closest(".ui-panel");
        if (!modal && isOpen) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ui-backdrop" class:pt-16={position === "top"} class:items-start={position === "top"} style="z-index: {zIndex}; pointer-events: auto;" onclick={handleBackdropClick} onfocusin={handleFocusTrap}>
        <div class="ui-panel shadow-2xl" style="min-width: {MODAL_CONSTRAINTS.MIN_WIDTH}; max-width: {MODAL_CONSTRAINTS.MAX_WIDTH}; max-height: {position === 'top' ? 'calc(100vh - 5rem)' : MODAL_CONSTRAINTS.MAX_HEIGHT}; width: fit-content; display: flex; flex-direction: column;" onclick={(e) => e.stopPropagation()}>
            <!-- Header Strategy: Snippet First, then Title+Close Default -->
            {#if header}
                <div class="ui-header flex justify-between items-center">
                    {@render header()}
                </div>
            {:else if title}
                <div class="ui-header flex justify-between items-center">
                    <span class="text-sm font-semibold text-fg-default">{title}</span>
                    <button class="p-1 rounded hover:bg-white/10 transition-colors text-fg-muted" onclick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
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
                <div class="px-4 py-3 border-t flex justify-end gap-2 shrink-0 border-border-main bg-bg-panel">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
