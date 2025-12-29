<script lang="ts">
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
    let actualSide = $state<"left" | "right">("right");
    let adjustedTop = $state(0);
    const HOVER_DELAY = 150; // Slightly reduced for snappier feel

    function handleMouseEnter() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        if (!show) {
            show = true;
            if (onOpen) onOpen();
        }
    }

    function handleMouseLeave() {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => {
            show = false;
            if (onClose) onClose();
            hoverTimer = null;
        }, HOVER_DELAY);
    }

    function adjustPosition() {
        if (!submenuEl) return;

        const rect = submenuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        if (side === "right" && rect.right > winWidth - 5) {
            actualSide = "left";
        } else if (side === "left" && rect.left < 5) {
            actualSide = "right";
        } else {
            actualSide = side;
        }

        let newTop = 0;
        if (rect.bottom > winHeight - 32) {
            newTop = winHeight - 32 - rect.bottom;
        } else if (rect.top < 5) {
            newTop = 5 - rect.top;
        }
        adjustedTop = newTop;
    }

    // Effect to handle external state changes
    $effect(() => {
        if (show) {
            actualSide = side;
            requestAnimationFrame(() => adjustPosition());
        } else {
            // If show is set to false from outside, kill any pending open/close timers
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
        }
    });

    onDestroy(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
</script>

<div class="relative submenu-container" onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="none">
    {@render trigger()}

    {#if show}
        <div bind:this={submenuEl} class="absolute flex flex-col w-max min-w-[160px] max-w-[350px] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-md shadow-xl border py-1 z-50 whitespace-nowrap bg-bg-panel border-border-light" style="{actualSide === 'left' ? 'right: 100%;' : 'left: 100%;'} top: {adjustedTop}px;" role="menu" tabindex="-1">
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .submenu-container {
        position: relative;
        display: block;
        width: 100%;
    }
</style>
