<script lang="ts">
    /**
     * Shared Submenu Component
     * Provides consistent submenu behavior with proper hover handling
     */
    import { onDestroy, type Snippet } from "svelte";

    let {
        show = $bindable(false),
        side = "right",
        trigger,
        children,
        onOpen,
        onClose,
    } = $props<{
        show?: boolean;
        side?: "left" | "right";
        trigger: Snippet;
        children: Snippet;
        onOpen?: () => void;
        onClose?: () => void;
    }>();

    let hoverTimer: number | null = null;
    let submenuEl = $state<HTMLDivElement>();
    // Initialize with a static default to avoid "reference only captures initial value" warning.
    // The actual side is recalculated immediately upon showing via adjustPosition.
    let actualSide = $state<"left" | "right">("right");
    let adjustedTop = $state(0);
    const HOVER_DELAY = 200;

    function handleMouseEnter() {
        if (hoverTimer) clearTimeout(hoverTimer);
        show = true;
        if (onOpen) onOpen();
    }

    function handleMouseLeave() {
        hoverTimer = window.setTimeout(() => {
            show = false;
            if (onClose) onClose();
        }, HOVER_DELAY);
    }

    function adjustPosition() {
        if (!submenuEl) return;

        const rect = submenuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        // Check horizontal overflow and adjust side if needed
        if (side === "right" && rect.right > winWidth - 5) {
            actualSide = "left";
        } else if (side === "left" && rect.left < 5) {
            actualSide = "right";
        } else {
            actualSide = side;
        }

        // Check vertical overflow and adjust top position if needed
        let newTop = 0;
        if (rect.bottom > winHeight - 32) {
            newTop = winHeight - 32 - rect.bottom;
        } else if (rect.top < 5) {
            newTop = 5 - rect.top;
        }
        adjustedTop = newTop;
    }

    $effect(() => {
        if (show) {
            // Reset to preferred side immediately so layout starts correct before adjustment check
            actualSide = side;
            // Wait for next tick to ensure element is rendered
            requestAnimationFrame(() => adjustPosition());
        }
    });

    onDestroy(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
</script>

<div class="relative submenu-container">
    <div onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="none">
        {@render trigger()}
    </div>

    {#if show}
        <div bind:this={submenuEl} class="absolute flex flex-col w-max min-w-[160px] max-w-[350px] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-md shadow-xl border py-1 z-50 whitespace-nowrap bg-bg-panel border-border-light" style="{actualSide === 'left' ? 'right: 100%;' : 'left: 100%;'} top: {adjustedTop}px;" onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="menu" tabindex="-1">
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .submenu-container {
        position: relative;
    }
</style>
