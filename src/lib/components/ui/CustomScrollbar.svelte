<script lang="ts">
    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
        onScrollClick?: (ratio: number) => void;
    }

    let { viewport, content, onScrollClick }: Props = $props();

    let trackRef = $state<HTMLDivElement>();
    let thumbRef = $state<HTMLDivElement>();

    let thumbHeight = $state(20);
    let isVisible = $state(false);
    let isDragging = $state(false);

    let startY = 0;
    let startThumbTop = 0;
    let currentThumbTop = 0;

    let resizeObserver: ResizeObserver;
    let frameId: number | null = null;

    // Smooth scroll state
    let scrollTarget = 0;
    let scrollStartTime = 0;
    let scrollStartPos = 0;
    let isAnimating = false;

    // Cache metrics to avoid layout thrashing during scroll/drag
    let metrics = {
        viewportHeight: 0,
        viewportScrollHeight: 0,
        trackHeight: 0,
    };

    function measure() {
        if (!viewport) return;

        // Cache viewport metrics
        const rect = viewport.getBoundingClientRect();
        metrics.viewportHeight = rect.height;
        metrics.viewportScrollHeight = viewport.scrollHeight;

        if (metrics.viewportHeight === 0 || isNaN(metrics.viewportHeight)) {
            isVisible = false;
            return;
        }

        const shouldBeVisible = metrics.viewportScrollHeight > metrics.viewportHeight + 1;

        if (isVisible !== shouldBeVisible) {
            isVisible = shouldBeVisible;
        }

        if (!isVisible) return;

        // Cache track metrics
        if (trackRef) {
            metrics.trackHeight = trackRef.getBoundingClientRect().height;
        }
        if (!metrics.trackHeight) {
            metrics.trackHeight = metrics.viewportHeight - 4;
        }

        const heightRatio = metrics.viewportHeight / metrics.viewportScrollHeight;
        thumbHeight = Math.max(20, metrics.trackHeight * heightRatio);

        syncPosition();
    }

    function syncPosition() {
        if (!viewport || !isVisible || !thumbRef || isDragging) return;

        const scrollTop = viewport.scrollTop;
        const maxScroll = metrics.viewportScrollHeight - metrics.viewportHeight;
        const maxThumb = metrics.trackHeight - thumbHeight;

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
            if (!frameId) {
                frameId = requestAnimationFrame(() => {
                    frameId = null;
                    syncPosition();
                });
            }
        } else if (isAnimating) {
            syncPosition();
        }
    }

    function smoothScrollTo(target: number) {
        if (!viewport) return;

        scrollTarget = Math.max(
            0,
            Math.min(target, metrics.viewportScrollHeight - metrics.viewportHeight),
        );
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

        const progress = elapsed / duration;
        const ease = 1 - Math.pow(1 - progress, 3);

        const newPos = scrollStartPos + (scrollTarget - scrollStartPos) * ease;
        viewport.scrollTop = newPos;
        syncPosition();

        requestAnimationFrame(animateScroll);
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest('.scrollbar-thumb')) return;
        e.preventDefault();

        measure();

        const maxThumbTravel = metrics.trackHeight - thumbHeight;
        const maxScrollTravel = metrics.viewportScrollHeight - metrics.viewportHeight;

        if (maxThumbTravel <= 0) return;

        const clickOffset = e.clientY - trackRef.getBoundingClientRect().top;
        let targetThumbTop = clickOffset - thumbHeight / 2;
        targetThumbTop = Math.max(0, Math.min(maxThumbTravel, targetThumbTop));

        const scrollRatio = targetThumbTop / maxThumbTravel;

        if (onScrollClick) {
            onScrollClick(scrollRatio);
        } else {
            const targetScrollTop = scrollRatio * maxScrollTravel;
            smoothScrollTo(targetScrollTop);
        }
    }

    function onThumbMouseDown(e: MouseEvent) {
        if (!viewport) return;
        e.preventDefault();
        e.stopPropagation();

        isAnimating = false;
        measure();

        startY = e.clientY;
        startThumbTop = currentThumbTop;
        isDragging = true;

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'default';

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport || !thumbRef) return;
        e.preventDefault();

        const maxThumb = metrics.trackHeight - thumbHeight;
        const maxScroll = metrics.viewportScrollHeight - metrics.viewportHeight;

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

        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        measure();
    }

    function setup() {
        if (!viewport) return;

        resizeObserver?.disconnect();

        const debouncedMeasure = () => {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                frameId = null;
                measure();
            });
        };

        resizeObserver = new ResizeObserver(debouncedMeasure);
        resizeObserver.observe(viewport);

        if (content) {
            resizeObserver.observe(content);
        } else if (viewport.firstElementChild) {
            resizeObserver.observe(viewport.firstElementChild);
        }

        viewport.addEventListener('scroll', onScroll, { passive: true });

        measure();
    }

    $effect(() => {
        if (viewport) {
            setup();
            return () => {
                if (frameId) cancelAnimationFrame(frameId);
                viewport?.removeEventListener('scroll', onScroll);
                resizeObserver?.disconnect();
            };
        }
    });
</script>

<div
    bind:this={trackRef}
    role="none"
    class="group absolute top-0.5 right-0 bottom-0.5 z-60 flex w-4 justify-center bg-transparent"
    class:opacity-0={!isVisible}
    class:pointer-events-none={!isVisible}
    onmousedown={onTrackMouseDown}>
    <div
        bind:this={thumbRef}
        role="none"
        class="scrollbar-thumb absolute top-0 w-1 cursor-pointer rounded-full"
        class:bg-fg-muted={!isDragging}
        class:bg-accent-primary={isDragging}
        class:opacity-30={!isDragging}
        class:group-hover:opacity-70={!isDragging}
        class:group-hover:w-3={!isDragging}
        class:w-3={isDragging}
        class:!opacity-100={isDragging}
        style="height: {thumbHeight}px;"
        onmousedown={onThumbMouseDown}>
    </div>
</div>
