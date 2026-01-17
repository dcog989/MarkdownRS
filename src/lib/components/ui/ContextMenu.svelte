<script lang="ts">
    import { onMount, type Snippet } from 'svelte';

    let { x, y, onClose, children } = $props<{
        x: number;
        y: number;
        onClose: () => void;
        children: Snippet<[{ submenuSide: 'left' | 'right' }]>;
    }>();

    let menuEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);
    let submenuSide = $state<'left' | 'right'>('right');
    let isVisible = $state(false);
    let resizeObserver: ResizeObserver | null = null;

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        // X-Axis constraint
        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }

        // Y-Axis constraint (Status Bar protection)
        const statusBarHeight = 32;
        const padding = 8;

        // If the menu height is taller than available space, we let flex/scroll handle it via max-h
        // We just need to ensure the top doesn't start too low if it would push bottom off screen
        if (newY + rect.height > winHeight - statusBarHeight) {
            newY = winHeight - rect.height - statusBarHeight - padding;
        }

        adjustedX = Math.max(5, newX);
        adjustedY = Math.max(5, newY);
        submenuSide = adjustedX + rect.width + 180 > winWidth ? 'left' : 'right';
        isVisible = true;
    }

    $effect(() => {
        updatePosition();
    });

    onMount(() => {
        if (menuEl) {
            resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => updatePosition());
            });
            resizeObserver.observe(menuEl);
        }

        updatePosition();

        return () => {
            resizeObserver?.disconnect();
        };
    });

    function handleBackdropContextMenu(e: MouseEvent) {
        e.preventDefault();
        const backdrop = e.currentTarget as HTMLElement;
        const originalDisplay = backdrop.style.display;
        backdrop.style.display = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        backdrop.style.display = originalDisplay;
        onClose();
        if (target) {
            const newEvent = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 2,
                buttons: 2,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
            });
            target.dispatchEvent(newEvent);
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-200" onclick={onClose} oncontextmenu={handleBackdropContextMenu}>
    <div
        bind:this={menuEl}
        class="absolute min-w-50 max-w-75 max-h-[calc(100vh-64px)] overflow-y-auto rounded-md shadow-xl border py-1 z-200 bg-bg-panel border-border-light text-fg-default"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            opacity: {isVisible ? 1 : 0};
        "
        onclick={(e) => e.stopPropagation()}
        oncontextmenu={(e) => e.preventDefault()}>
        {@render children({ submenuSide })}
    </div>
</div>
