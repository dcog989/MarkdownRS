<script lang="ts">
    import { onMount, type Snippet } from "svelte";

    let { x, y, onClose, children } = $props<{
        x: number;
        y: number;
        onClose: () => void;
        children: Snippet<[{ submenuSide: "left" | "right" }]>;
    }>();

    let menuEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);
    let submenuSide = $state<"left" | "right">("right");
    let isVisible = $state(false);

    function updatePosition() {
        if (!menuEl) return;

        const rect = menuEl.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        if (newX + rect.width > winWidth) {
            newX = winWidth - rect.width - 5;
        }
        // Account for status bar height (24px = h-6) when positioning near bottom
        const statusBarHeight = 24;
        if (newY + rect.height > winHeight - statusBarHeight) {
            newY = winHeight - rect.height - statusBarHeight - 5;
        }

        adjustedX = Math.max(5, newX);
        adjustedY = Math.max(5, newY);
        submenuSide = adjustedX + rect.width + 180 > winWidth ? "left" : "right";
        isVisible = true;
    }

    $effect(() => {
        updatePosition();
    });

    onMount(() => {
        updatePosition();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50"
    onclick={onClose}
    oncontextmenu={(e) => {
        e.preventDefault();
        onClose();
    }}
>
    <div
        bind:this={menuEl}
        class="absolute min-w-[200px] rounded-md shadow-xl border py-1 z-50 bg-bg-panel border-border-light text-fg-default"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            opacity: {isVisible ? 1 : 0};
        "
        onclick={(e) => e.stopPropagation()}
    >
        {@render children({ submenuSide })}
    </div>
</div>
