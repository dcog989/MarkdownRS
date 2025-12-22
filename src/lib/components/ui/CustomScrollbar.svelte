<script lang="ts">
    import { onDestroy } from "svelte";

    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
    }

    let { viewport, content }: Props = $props();

    let trackRef: HTMLDivElement;

    // State
    let thumbHeight = $state(20);
    let thumbTop = $state(0);
    let isVisible = $state(false);
    let isDragging = $state(false);

    // Cache
    let viewHeight = 0;
    let scrollHeight = 0;

    // Drag data
    let startY = 0;
    let startThumbTop = 0;

    let resizeObserver: ResizeObserver;

    function updateMetrics() {
        if (!viewport) return;
        viewHeight = viewport.clientHeight;
        scrollHeight = viewport.scrollHeight;

        // Hide if content fits
        if (scrollHeight <= viewHeight) {
            isVisible = false;
            return;
        }

        isVisible = true;

        // Calculate thumb height (min 20px)
        // Subtract 4px for top/bottom padding
        const trackHeight = viewHeight - 4;
        const ratio = trackHeight / scrollHeight;
        thumbHeight = Math.max(20, trackHeight * ratio);
    }

    function syncThumbToScroll() {
        if (!viewport || isDragging) return;

        const trackHeight = viewHeight - 4;
        const maxScroll = scrollHeight - viewHeight;
        const maxThumb = trackHeight - thumbHeight;

        if (maxScroll > 0) {
            const scrollTop = viewport.scrollTop;
            thumbTop = (scrollTop / maxScroll) * maxThumb;
        }
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        const rect = trackRef.getBoundingClientRect();
        // Adjust for top margin
        const clickOffset = e.clientY - rect.top;

        const trackHeight = viewHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = scrollHeight - viewHeight;

        // Center thumb on click
        const targetThumbTop = Math.max(0, Math.min(maxThumb, clickOffset - thumbHeight / 2));

        viewport.scrollTo({
            top: (targetThumbTop / maxThumb) * maxScroll,
            behavior: "auto",
        });
    }

    function onThumbMouseDown(e: MouseEvent) {
        if (!viewport) return;
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        startY = e.clientY;
        startThumbTop = thumbTop;

        viewport.style.scrollBehavior = "auto";
        document.body.style.userSelect = "none";
        document.body.style.cursor = "default";

        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport) return;

        const deltaY = e.clientY - startY;
        const trackHeight = viewHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = scrollHeight - viewHeight;

        if (maxThumb > 0) {
            // 1. Update visual state immediately
            let newTop = startThumbTop + deltaY;
            newTop = Math.max(0, Math.min(maxThumb, newTop));
            thumbTop = newTop;

            // 2. Update scroll position based on thumb
            const scrollRatio = newTop / maxThumb;
            viewport.scrollTop = scrollRatio * maxScroll;
        }
    }

    function onMouseUp() {
        isDragging = false;

        if (viewport) {
            viewport.style.scrollBehavior = "";
        }
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    }

    function setupObservers(el: HTMLElement) {
        el.addEventListener("scroll", syncThumbToScroll, { passive: true });

        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(() => {
            updateMetrics();
            syncThumbToScroll();
        });

        resizeObserver.observe(el);
        if (content) resizeObserver.observe(content);
        else if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);

        updateMetrics();
        syncThumbToScroll();
    }

    $effect(() => {
        if (viewport) {
            setupObservers(viewport);
            return () => {
                viewport?.removeEventListener("scroll", syncThumbToScroll);
                resizeObserver?.disconnect();
            };
        }
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }
        resizeObserver?.disconnect();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={trackRef} class="group scrollbar-track absolute right-0 top-[2px] bottom-[2px] z-50 flex w-[16px] justify-center bg-transparent" class:hidden={!isVisible} onmousedown={onTrackMouseDown}>
    <div
        class="scrollbar-thumb absolute left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-border-light)] transition-[width,background-color] duration-150 group-hover:bg-white/40 active:bg-[var(--color-accent-primary)]"
        class:w-[2px]={!isDragging}
        class:group-hover:w-[8px]={!isDragging}
        class:w-[8px]={isDragging}
        style="
            height: {thumbHeight}px;
            top: {thumbTop}px;
        "
        onmousedown={onThumbMouseDown}
    ></div>
</div>

<style>
    .hidden {
        display: none;
    }
</style>
