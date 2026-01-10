<script lang="ts">
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

    // Smooth scroll state
    let scrollTarget = 0;
    let scrollStartTime = 0;
    let scrollStartPos = 0;
    let isAnimating = false;

    function measure() {
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        const clientHeight = rect.height;
        const scrollHeight = viewport.scrollHeight;

        if (clientHeight === 0 || isNaN(clientHeight)) {
            isVisible = false;
            return;
        }

        const shouldBeVisible = scrollHeight > clientHeight + 1;

        if (isVisible !== shouldBeVisible) {
            isVisible = shouldBeVisible;
        }

        if (!isVisible) return;

        // Calculate dimensions
        const trackH = trackRef ? trackRef.getBoundingClientRect().height : clientHeight - 4;
        const heightRatio = clientHeight / scrollHeight;

        thumbHeight = Math.max(20, trackH * heightRatio);

        syncPosition();
    }

    function syncPosition() {
        if (!viewport || !isVisible || !thumbRef || isDragging) return;

        const scrollTop = viewport.scrollTop;
        const scrollHeight = viewport.scrollHeight;
        const clientHeight = viewport.clientHeight;
        const trackH = trackRef ? trackRef.getBoundingClientRect().height : clientHeight - 4;

        const maxScroll = scrollHeight - clientHeight;
        const maxThumb = trackH - thumbHeight;

        if (maxScroll > 0 && maxThumb > 0) {
            const scrollRatio = scrollTop / maxScroll;
            currentThumbTop = scrollRatio * maxThumb;
        } else {
            currentThumbTop = 0;
        }

        thumbRef.style.transform = `translateY(${currentThumbTop}px)`;
    }

    function onScroll() {
        if (!isDragging && !isAnimating) {
            requestAnimationFrame(syncPosition);
        } else if (isAnimating) {
            // During animation, we still need to sync the thumb
            syncPosition();
        }
    }

    function smoothScrollTo(target: number) {
        if (!viewport) return;

        scrollTarget = Math.max(0, Math.min(target, viewport.scrollHeight - viewport.clientHeight));
        scrollStartPos = viewport.scrollTop;

        if (scrollStartPos === scrollTarget) return;

        scrollStartTime = performance.now();
        isAnimating = true;

        requestAnimationFrame(animateScroll);
    }

    function animateScroll(currentTime: number) {
        if (!isAnimating || !viewport) return;

        const elapsed = currentTime - scrollStartTime;
        const duration = 200; // ms

        if (elapsed >= duration) {
            viewport.scrollTop = scrollTarget;
            isAnimating = false;
            syncPosition();
            return;
        }

        // Ease out cubic
        const progress = elapsed / duration;
        const ease = 1 - Math.pow(1 - progress, 3);

        const newPos = scrollStartPos + (scrollTarget - scrollStartPos) * ease;
        viewport.scrollTop = newPos;
        syncPosition(); // Keep thumb synced during animation

        requestAnimationFrame(animateScroll);
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        measure();

        const trackRect = trackRef.getBoundingClientRect();
        const scrollH = viewport.scrollHeight;
        const clientH = viewport.clientHeight;
        const trackH = trackRect.height;

        if (scrollH <= clientH) return;

        const maxThumbTravel = trackH - thumbHeight;
        const maxScrollTravel = scrollH - clientH;

        if (maxThumbTravel <= 0) return;

        const clickOffset = e.clientY - trackRect.top;
        let targetThumbTop = clickOffset - thumbHeight / 2;
        targetThumbTop = Math.max(0, Math.min(maxThumbTravel, targetThumbTop));

        const scrollRatio = targetThumbTop / maxThumbTravel;
        const targetScrollTop = scrollRatio * maxScrollTravel;

        smoothScrollTo(targetScrollTop);
    }

    function onThumbMouseDown(e: MouseEvent) {
        if (!viewport) return;
        e.preventDefault();
        e.stopPropagation();

        // Cancel any active animation
        isAnimating = false;

        startY = e.clientY;
        startThumbTop = currentThumbTop;
        isDragging = true;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "default";

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport || !thumbRef || !trackRef) return;
        e.preventDefault();

        const trackRect = trackRef.getBoundingClientRect();
        const trackH = trackRect.height;
        const scrollH = viewport.scrollHeight;
        const clientH = viewport.clientHeight;

        const maxThumb = trackH - thumbHeight;
        const maxScroll = scrollH - clientH;

        if (maxThumb <= 0) return;

        const deltaY = e.clientY - startY;
        let newTop = startThumbTop + deltaY;
        newTop = Math.max(0, Math.min(maxThumb, newTop));

        currentThumbTop = newTop;
        thumbRef.style.transform = `translateY(${newTop}px)`;

        const scrollRatio = newTop / maxThumb;
        viewport.scrollTop = scrollRatio * maxScroll;
    }

    function onMouseUp() {
        if (!isDragging) return;
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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={trackRef} class="absolute right-0 top-0.5 bottom-0.5 z-[60] flex w-4 justify-center bg-transparent transition-opacity duration-200 group" class:opacity-0={!isVisible} class:opacity-100={isVisible} class:pointer-events-none={!isVisible} onmousedown={onTrackMouseDown}>
    <div bind:this={thumbRef} class="scrollbar-thumb absolute top-0 w-1 rounded-full bg-border-light opacity-50 hover:opacity-100 hover:bg-fg-muted group-hover:w-3 active:bg-accent-primary active:opacity-100 active:w-3 transition-[width,background-color,opacity] duration-150 cursor-pointer" class:w-3={isDragging} class:!opacity-100={isDragging} class:bg-accent-primary={isDragging} style="height: {thumbHeight}px; will-change: transform;" onmousedown={onThumbMouseDown}></div>
</div>
