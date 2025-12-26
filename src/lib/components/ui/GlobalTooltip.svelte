<script lang="ts">
    import { tooltipStore } from "$lib/stores/tooltipStore.svelte.ts";
    import { CONFIG } from "$lib/utils/config";

    let tooltipEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    $effect(() => {
        if (tooltipStore.visible && tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let newX = tooltipStore.x;
            let newY = tooltipStore.y + CONFIG.UI.TOOLTIP_OFFSET_Y;

            // Shift left if overflowing right edge
            if (newX + rect.width > winW) {
                newX = winW - rect.width - CONFIG.UI.TOOLTIP_SCREEN_PADDING;
            }

            // Safety check for left edge
            if (newX < CONFIG.UI.TOOLTIP_SCREEN_PADDING) newX = CONFIG.UI.TOOLTIP_SCREEN_PADDING;

            // Shift up if overflowing bottom edge
            if (newY + rect.height > winH) {
                newY = tooltipStore.y - rect.height - CONFIG.UI.TOOLTIP_FLIP_OFFSET;
            }

            adjustedX = newX;
            adjustedY = newY;
        }
    });
</script>

{#if tooltipStore.visible && tooltipStore.content}
    <div bind:this={tooltipEl} class="fixed z-[9999] pointer-events-none" style="left: {adjustedX}px; top: {adjustedY}px;">
        <div
            class="p-2 rounded shadow-2xl border text-ui-sm whitespace-pre-line max-w-lg w-max break-words leading-relaxed"
            style="
                background-color: var(--color-bg-header);
                border-color: var(--color-border-light);
                color: var(--color-fg-default);
            "
        >
            {tooltipStore.content}
        </div>
    </div>
{/if}
