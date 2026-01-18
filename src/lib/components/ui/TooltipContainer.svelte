<script lang="ts">
    import { CONFIG } from '$lib/utils/config';
    import type { Snippet } from 'svelte';
    import { fade } from 'svelte/transition';

    let {
        x,
        y,
        isVisible,
        children,
        className = 'break-words w-max',
    } = $props<{
        x: number;
        y: number;
        isVisible: boolean;
        children: Snippet;
        className?: string;
    }>();

    let tooltipEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    $effect(() => {
        if (!isVisible) {
            adjustedX = x;
            adjustedY = y + CONFIG.UI.TOOLTIP_OFFSET_Y;
            return;
        }

        if (tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let newX = x;
            let newY = y + CONFIG.UI.TOOLTIP_OFFSET_Y;

            if (newX + rect.width > winW) {
                newX = winW - rect.width - CONFIG.UI.TOOLTIP_SCREEN_PADDING;
            }

            if (newX < CONFIG.UI.TOOLTIP_SCREEN_PADDING) {
                newX = CONFIG.UI.TOOLTIP_SCREEN_PADDING;
            }

            if (newY + rect.height > winH) {
                newY = y - rect.height - CONFIG.UI.TOOLTIP_FLIP_OFFSET;
            }

            adjustedX = newX;
            adjustedY = newY;
        }
    });
</script>

{#if isVisible}
    <div
        bind:this={tooltipEl}
        class="pointer-events-none fixed z-9999"
        style="left: {adjustedX}px; top: {adjustedY}px;"
        transition:fade={{ duration: CONFIG.UI.ANIMATION_DURATION_MS }}>
        <div
            class="text-ui-sm max-w-lg rounded border p-2 leading-relaxed whitespace-pre-line shadow-2xl {className} bg-bg-header border-border-light text-fg-default">
            {@render children()}
        </div>
    </div>
{/if}
