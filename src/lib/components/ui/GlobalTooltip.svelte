<script lang="ts">
    import { tooltipStore } from "$lib/stores/tooltipStore.svelte.ts";

    let tooltipEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    $effect(() => {
        if (tooltipStore.visible && tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let newX = tooltipStore.x;
            let newY = tooltipStore.y + 20;

            // Shift left if overflowing right edge
            if (newX + rect.width > winW) {
                newX = winW - rect.width - 10;
            }

            // Safety check for left edge
            if (newX < 10) newX = 10;

            // Shift up if overflowing bottom edge
            if (newY + rect.height > winH) {
                newY = tooltipStore.y - rect.height - 5;
            }

            adjustedX = newX;
            adjustedY = newY;
        }
    });
</script>

{#if tooltipStore.visible && tooltipStore.content}
    <div bind:this={tooltipEl} class="fixed z-[9999] pointer-events-none" style="left: {adjustedX}px; top: {adjustedY}px;">
        <div
            class="p-3 rounded shadow-2xl border text-xs whitespace-pre-line max-w-lg w-max break-words leading-relaxed"
            style="
                background-color: var(--bg-header);
                border-color: var(--border-light);
                color: var(--fg-default);
            "
        >
            {tooltipStore.content}
        </div>
    </div>
{/if}
