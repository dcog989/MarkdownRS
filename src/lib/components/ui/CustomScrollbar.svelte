<script lang="ts">
    import { onDestroy } from "svelte";

    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
    }

    let { viewport, content }: Props = $props();

    let trackRef = $state<HTMLDivElement>();
    let thumbRef = $state<HTMLDivElement>();

    let thumbHeight = $state(20);
    let isVisible = $state(false);
    let isDragging = $state(false);

    let startY = 0;
    let startThumbTop = 0;
    let currentThumbTop = 0;

    let resizeObserver: ResizeObserver;
    let mutationObserver: MutationObserver;
    let frameId: number | null = null;

    let clientHeight = 0;
    let scrollHeight = 0;

    function measure() {
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        clientHeight = rect.height;
        scrollHeight = viewport.scrollHeight;

        if (clientHeight === 0 || isNaN(clientHeight)) {
            isVisible = false;
            return;
        }

        const shouldBeVisible = scrollHeight > clientHeight + 1;

        if (isVisible !== shouldBeVisible) {
            isVisible = shouldBeVisible;
        }

        if (!isVisible) return;

        const trackHeight = clientHeight - 4;
        const heightRatio = clientHeight / scrollHeight;
        thumbHeight = Math.max(20, trackHeight * heightRatio);

        syncPosition();
    }

    function syncPosition() {
        if (!viewport || !isVisible || !thumbRef || isDragging) return;

        const scrollTop = viewport.scrollTop;
        const maxScroll = scrollHeight - clientHeight;
        const trackHeight = clientHeight - 4;
        const maxThumb = trackHeight - thumbHeight;

        if (maxScroll > 0) {
            const scrollRatio = scrollTop / maxScroll;
            currentThumbTop = scrollRatio * maxThumb;
        } else {
            currentThumbTop = 0;
        }

        thumbRef.style.transform = `translateY(${currentThumbTop}px)`;
    }

    function onScroll() {
        syncPosition();
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        const rect = trackRef.getBoundingClientRect();
        const clickOffset = e.clientY - rect.top;

        clientHeight = viewport.clientHeight;
        scrollHeight = viewport.scrollHeight;

        const trackHeight = clientHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = scrollHeight - clientHeight;

        let targetThumbTop = clickOffset - thumbHeight / 2;
        targetThumbTop = Math.max(0, Math.min(maxThumb, targetThumbTop));

        const scrollRatio = targetThumbTop / maxThumb;

        viewport.scrollTo({
            top: scrollRatio * maxScroll,
            behavior: "smooth",
        });
    }

    function onThumbMouseDown(e: MouseEvent) {
        if (!viewport) return;
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        startY = e.clientY;
        startThumbTop = currentThumbTop;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "default";
        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport || !thumbRef) return;

        const deltaY = e.clientY - startY;
        const trackHeight = clientHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (maxThumb > 0) {
            let newTop = startThumbTop + deltaY;
            newTop = Math.max(0, Math.min(maxThumb, newTop));

            thumbRef.style.transform = `translateY(${newTop}px)`;
            currentThumbTop = newTop;

            const scrollRatio = newTop / maxThumb;
            viewport.scrollTop = scrollRatio * maxScroll;
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        measure();
    }

    function setup() {
        if (!viewport) return;

        resizeObserver?.disconnect();
        mutationObserver?.disconnect();

        const debouncedMeasure = () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(measure);
        };

        resizeObserver = new ResizeObserver(debouncedMeasure);
        resizeObserver.observe(viewport);

        if (content) {
            resizeObserver.observe(content);
        } else if (viewport.firstElementChild) {
            resizeObserver.observe(viewport.firstElementChild);
        }

        mutationObserver = new MutationObserver(debouncedMeasure);
        mutationObserver.observe(viewport, { childList: true, subtree: true, attributes: true });

        viewport.addEventListener("scroll", onScroll, { passive: true });

        measure();
    }

    $effect(() => {
        if (viewport) {
            setup();
            return () => {
                if (frameId) cancelAnimationFrame(frameId);
                viewport?.removeEventListener("scroll", onScroll);
                resizeObserver?.disconnect();
                mutationObserver?.disconnect();
            };
        }
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={trackRef} class="absolute right-0 top-0.5 bottom-0.5 z-[60] flex w-4 justify-center bg-transparent transition-opacity duration-200 group" class:opacity-0={!isVisible} class:opacity-100={isVisible} class:pointer-events-none={!isVisible} onmousedown={onTrackMouseDown}>
    <div bind:this={thumbRef} class="absolute top-0 w-1 rounded-full bg-border-light hover:bg-fg-muted group-hover:w-3 active:bg-accent-primary active:w-3 transition-[width,background-color] duration-150 cursor-pointer" class:w-3={isDragging} class:bg-accent-primary={isDragging} style="height: {thumbHeight}px; will-change: transform;" onmousedown={onThumbMouseDown}></div>
</div>
