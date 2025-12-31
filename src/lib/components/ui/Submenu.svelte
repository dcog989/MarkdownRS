<script lang="ts">
    import { onDestroy, type Snippet } from "svelte";

    let {
        show = false,
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
    let containerEl = $state<HTMLDivElement>();

    // State for fixed positioning
    let fixedX = $state(0);
    let fixedY = $state(0);

    const HOVER_DELAY = 150;

    function handleMouseEnter() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        if (!show) {
            onOpen?.();
        }
    }

    function handleMouseLeave() {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => {
            onClose?.();
            hoverTimer = null;
        }, HOVER_DELAY);
    }

    function adjustPosition() {
        if (!submenuEl || !containerEl) return;

        const triggerRect = containerEl.getBoundingClientRect();
        const submenuRect = submenuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        // X Axis Calculation
        // Default to placing to the right of the trigger
        let x = triggerRect.right;

        // If preferred side is left, or if right side overflows
        if (side === "left" || x + submenuRect.width > winWidth - 5) {
            // Place to the left of the trigger
            x = triggerRect.left - submenuRect.width;

            // If that overflows left (rare), force right (clamped)
            if (x < 5) {
                x = triggerRect.right;
            }
        }

        // Y Axis Calculation
        // Default to aligning top of submenu with top of trigger item
        // The triggerRect.top includes the scroll offset of the parent ContextMenu because it's a viewport coordinate
        let y = triggerRect.top - 4; // -4 for slight visual overlap/padding alignment

        const statusBarHeight = 32;
        const maxBottom = winHeight - statusBarHeight;

        // If bottom extends past viewport limit, shift up
        if (y + submenuRect.height > maxBottom) {
            y = maxBottom - submenuRect.height - 5;
        }

        // Ensure we don't shift off the top
        if (y < 5) {
            y = 5;
        }

        fixedX = x;
        fixedY = y;
    }

    $effect(() => {
        if (show) {
            // Reset position off-screen initially to avoid flicker before calculation
            // or rely on reactivity.
            // Using requestAnimationFrame ensures the DOM is rendered (so getBoundingClientRect works)
            requestAnimationFrame(() => adjustPosition());
        } else {
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

<div bind:this={containerEl} class="relative submenu-container w-full" onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="none">
    {@render trigger()}

    {#if show}
        <!--
            position: fixed is crucial here to escape the overflow:hidden/auto of the parent ContextMenu
            z-index must be higher than ContextMenu (which is usually 50 or 200)
        -->
        <div bind:this={submenuEl} class="fixed flex flex-col w-max min-w-[160px] max-w-[350px] max-h-[50vh] overflow-y-auto custom-scrollbar rounded-md shadow-xl border py-1 z-[250] whitespace-nowrap bg-bg-panel border-border-light" style="left: {fixedX}px; top: {fixedY}px;" role="menu" tabindex="-1">
            {@render children()}
        </div>
    {/if}
</div>
