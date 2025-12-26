<script lang="ts">
    import { CONFIG } from "$lib/utils/config";
    import type { Snippet } from "svelte";
    import { fade } from "svelte/transition";

    let {
        x,
        y,
        isVisible,
        children,
        className = "break-words w-max",
    } = $props<{
        x: number;
        y: number;
        isVisible: boolean;
        children: Snippet;
        className?: string;
    }>();

    let tooltipEl = $state<HTMLDivElement>();
    // Initialize to 0 to avoid Svelte warning about capturing initial prop value.
    // The effect will synchronize the position immediately.
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    $effect(() => {
        // If hidden, keep position synced with target to prevent jump on show.
        // This ensures that when it mounts, it starts roughly where it should be.
        if (!isVisible) {
            adjustedX = x;
            adjustedY = y + CONFIG.UI.TOOLTIP_OFFSET_Y;
            return;
        }

        // If visible and rendered, apply boundary constraints
        if (tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let newX = x;
            let newY = y + CONFIG.UI.TOOLTIP_OFFSET_Y;

            // Shift left if overflowing right edge
            if (newX + rect.width > winW) {
                newX = winW - rect.width - CONFIG.UI.TOOLTIP_SCREEN_PADDING;
            }

            // Safety check for left edge
            if (newX < CONFIG.UI.TOOLTIP_SCREEN_PADDING) {
                newX = CONFIG.UI.TOOLTIP_SCREEN_PADDING;
            }

            // Shift up if overflowing bottom edge
            if (newY + rect.height > winH) {
                newY = y - rect.height - CONFIG.UI.TOOLTIP_FLIP_OFFSET;
            }

            adjustedX = newX;
            adjustedY = newY;
        }
    });
</script>

{#if isVisible}
    <div bind:this={tooltipEl} class="fixed z-[9999] pointer-events-none" style="left: {adjustedX}px; top: {adjustedY}px;" transition:fade={{ duration: CONFIG.UI.ANIMATION_DURATION_MS }}>
        <div
            class="p-2 rounded shadow-2xl border text-ui-sm whitespace-pre-line max-w-lg leading-relaxed {className}"
            style="
                background-color: var(--color-bg-header);
                border-color: var(--color-border-light);
                color: var(--color-fg-default);
            "
        >
            {@render children()}
        </div>
    </div>
{/if}
