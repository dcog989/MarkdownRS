<script lang="ts">
    import { onDestroy, type Snippet } from 'svelte';

    let {
        show = false,
        side = 'right',
        trigger,
        children,
        onOpen,
        onClose,
    } = $props<{
        show?: boolean;
        side?: 'left' | 'right';
        trigger: Snippet;
        children: Snippet;
        onOpen?: () => void;
        onClose?: () => void;
    }>();

    let hoverTimer: number | null = null;
    let submenuEl = $state<HTMLDivElement>();
    let containerEl = $state<HTMLDivElement>();

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

        let x = triggerRect.right;

        if (side === 'left' || x + submenuRect.width > winWidth - 5) {
            x = triggerRect.left - submenuRect.width;

            if (x < 5) {
                x = triggerRect.right;
            }
        }

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

<div
    bind:this={containerEl}
    class="submenu-container relative w-full"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    role="none"
>
    {@render trigger()}
    {#if show}
        <!-- ! NOTE: position fixed is crucial here to escape the overflow:hidden/auto of the parent -->
        <div
            bind:this={submenuEl}
            class="custom-scrollbar bg-bg-panel border-border-light fixed z-250 flex max-h-[50vh] w-max max-w-87.5 min-w-40 flex-col overflow-y-auto rounded-md border py-1 whitespace-nowrap shadow-xl"
            style="left: {fixedX}px; top: {fixedY}px;"
            role="menu"
            tabindex="-1"
        >
            {@render children()}
        </div>
    {/if}
</div>
