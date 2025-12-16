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

    onDestroy(() => {
        if (hoverTimer) clearTimeout(hoverTimer);
    });
</script>

<div class="relative submenu-container">
    <div onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="none">
        {@render trigger()}
    </div>

    {#if show}
        <div
            class="absolute top-0 min-w-[180px] rounded-md shadow-xl border py-1 z-50"
            style="
                background-color: var(--bg-panel);
                border-color: var(--border-light);
                {side === 'left' ? 'right: 100%; margin-right: 0px;' : 'left: 100%; margin-left: 0px;'}
            "
            onmouseenter={handleMouseEnter}
            onmouseleave={handleMouseLeave}
            role="menu"
            tabindex="-1"
        >
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .submenu-container {
        position: relative;
    }
</style>
