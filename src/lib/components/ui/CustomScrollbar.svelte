<script lang="ts">
    import { onDestroy } from "svelte";

    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
    }

    let { viewport, content }: Props = $props();

    let trackRef: HTMLDivElement;
    let thumbHeight = $state(20);
    let thumbTop = $state(0);
    let isVisible = $state(false);
    let isDragging = $state(false);
    let startY = 0;
    let startScrollTop = 0;
    let resizeObserver: ResizeObserver;

    function update() {
        if (!viewport) return;
        const { clientHeight, scrollHeight, scrollTop } = viewport;

        if (scrollHeight <= clientHeight) {
            isVisible = false;
            return;
        }

        isVisible = true;

        const ratio = clientHeight / scrollHeight;
        thumbHeight = Math.max(20, clientHeight * ratio);

        const maxScroll = scrollHeight - clientHeight;
        const maxThumb = clientHeight - thumbHeight;

        if (maxScroll > 0) {
            thumbTop = (scrollTop / maxScroll) * maxThumb;
        }
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || e.target === null || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        const rect = trackRef.getBoundingClientRect();
        const clickOffset = e.clientY - rect.top;

        // Center thumb on click
        const maxThumb = viewport.clientHeight - thumbHeight;
        let newThumbTop = clickOffset - thumbHeight / 2;
        newThumbTop = Math.max(0, Math.min(maxThumb, newThumbTop));

        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        const scrollRatio = newThumbTop / maxThumb;

        viewport.scrollTop = scrollRatio * maxScroll;
    }

    function onThumbMouseDown(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!viewport) return;

        isDragging = true;
        startY = e.clientY;
        startScrollTop = viewport.scrollTop;

        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport) return;

        const delta = e.clientY - startY;
        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        const maxThumb = viewport.clientHeight - thumbHeight;

        if (maxThumb > 0) {
            const scrollPerPixel = maxScroll / maxThumb;
            viewport.scrollTop = startScrollTop + delta * scrollPerPixel;
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    }

    function attachListeners(el: HTMLElement) {
        update();
        el.addEventListener("scroll", update);

        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver(() => update());

        resizeObserver.observe(el);
        if (content) resizeObserver.observe(content);
        // Also observe the first child as it often dictates size in CodeMirror/Preview
        else if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);
    }

    $effect(() => {
        if (viewport) {
            attachListeners(viewport);
            return () => {
                viewport?.removeEventListener("scroll", update);
                resizeObserver?.disconnect();
            };
        }
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }
        if (resizeObserver) resizeObserver.disconnect();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={trackRef} class="scrollbar-track absolute right-0 top-0 bottom-0 w-3 z-30 hover:bg-white/5 transition-all duration-200" class:hidden={!isVisible} onmousedown={onTrackMouseDown}>
    <div
        class="scrollbar-thumb absolute bg-[var(--border-light)] hover:bg-[var(--fg-muted)] active:bg-[var(--fg-muted)] transition-all duration-200"
        style="
            height: {thumbHeight}px;
            top: {thumbTop}px;
            width: 6px;
            right: 3px;
            border-radius: 9999px;
        "
        onmousedown={onThumbMouseDown}
    ></div>
</div>

<style>
    .hidden {
        display: none;
    }

    .scrollbar-track:hover {
        width: 14px;
    }

    .scrollbar-track:hover .scrollbar-thumb {
        width: 10px;
        right: 2px;
    }

    .scrollbar-thumb {
        transition: all 0.2s ease;
    }
</style>
