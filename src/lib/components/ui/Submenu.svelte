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
        <div class="absolute top-0 flex flex-col w-max min-w-[160px] max-w-[350px] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-md shadow-xl border py-1 z-50 whitespace-nowrap theme-bg-panel theme-border-light" style={side === "left" ? "right: 100%;" : "left: 100%;"} onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} role="menu" tabindex="-1">
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .submenu-container {
        position: relative;
    }
</style>
