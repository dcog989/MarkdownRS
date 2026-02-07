<script lang="ts">
    interface Props {
        viewport: HTMLElement | null;
    }

    let { viewport }: Props = $props();

    let trackRef = $state<HTMLDivElement>();
    let thumbRef = $state<HTMLDivElement>();
    let thumbHeight = $state(20);
    let thumbTop = $state(0);
    let isVisible = $state(false);
    let isDragging = $state(false);

    function updateScrollbar() {
        const viewportHeight = viewport?.clientHeight ?? 0;
        const scrollHeight = viewport?.scrollHeight ?? 0;
        const scrollTop = viewport?.scrollTop ?? 0;
        const trackHeight = trackRef?.clientHeight ?? 0;

        if (!viewportHeight || !trackHeight) return;

        // Check if scrollbar should be visible
        const shouldShow = scrollHeight > viewportHeight;
        if (isVisible !== shouldShow) {
            isVisible = shouldShow;
        }
        if (!isVisible) return;

        // Calculate thumb height (minimum 20px)
        const ratio = viewportHeight / scrollHeight;
        thumbHeight = Math.max(20, trackHeight * ratio);

        // Calculate thumb position
        const maxScroll = scrollHeight - viewportHeight;
        const maxThumbTravel = trackHeight - thumbHeight;
        thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTravel : 0;
    }

    function onTrackClick(e: MouseEvent) {
        if (e.target !== trackRef) return;
        e.preventDefault();

        const trackRect = trackRef?.getBoundingClientRect();
        if (!trackRect) return;

        const clickY = e.clientY - trackRect.top;
        const trackHeight = trackRect.height;

        // Calculate target scroll position based on click ratio
        let clickRatio = clickY / trackHeight;

        // Smart edge snapping based on thumb size and position
        // If clicking within one thumb-height from top/bottom, snap to edge
        const edgeSnapZone = thumbHeight / trackHeight;
        if (clickRatio < edgeSnapZone) {
            clickRatio = 0; // Snap to top
        } else if (clickRatio > 1 - edgeSnapZone) {
            clickRatio = 1; // Snap to bottom
        }

        const maxScroll = (viewport?.scrollHeight ?? 0) - (viewport?.clientHeight ?? 0);
        if (viewport) {
            viewport.scrollTop = clickRatio * maxScroll;
        }
    }

    function onThumbMouseDown(e: MouseEvent) {
        const thumbRect = thumbRef?.getBoundingClientRect();
        if (!thumbRect || !trackRef) return;
        e.preventDefault();
        e.stopPropagation();

        // Store offset from top of thumb to mouse position
        const thumbOffset = e.clientY - thumbRect.top;

        isDragging = true;

        function onMouseMove(e: MouseEvent) {
            const trackRect = trackRef?.getBoundingClientRect();
            if (!trackRect) return;
            e.preventDefault();

            const trackHeight = trackRect.height;
            const maxThumbTravel = trackHeight - thumbHeight;
            const maxScroll = (viewport?.scrollHeight ?? 0) - (viewport?.clientHeight ?? 0);

            // Calculate where the top of the thumb should be (mouse position minus offset)
            let newThumbTop = e.clientY - trackRect.top - thumbOffset;

            // Clamp to valid range
            newThumbTop = Math.max(0, Math.min(maxThumbTravel, newThumbTop));

            // Update thumb position directly during drag
            thumbTop = newThumbTop;

            // Update scroll position based on thumb position
            const scrollRatio = maxThumbTravel > 0 ? newThumbTop / maxThumbTravel : 0;
            if (viewport) {
                viewport.scrollTop = scrollRatio * maxScroll;
            }
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            // Update scrollbar one final time after drag ends
            requestAnimationFrame(updateScrollbar);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = 'none';
    }

    function onScroll() {
        if (!isDragging) {
            requestAnimationFrame(updateScrollbar);
        }
    }

    $effect(() => {
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(updateScrollbar);
        });

        if (viewport) {
            resizeObserver.observe(viewport);
            if (viewport.firstElementChild) {
                resizeObserver.observe(viewport.firstElementChild);
            }

            viewport.addEventListener('scroll', onScroll, { passive: true });
            updateScrollbar();
        }

        return () => {
            resizeObserver.disconnect();
            viewport?.removeEventListener('scroll', onScroll);
        };
    });
</script>

<div
    bind:this={trackRef}
    role="none"
    class="scrollbar-track absolute top-0.5 right-0 bottom-0.5 z-60 flex w-4 justify-center bg-transparent transition-opacity duration-150"
    class:opacity-0={!isVisible}
    class:pointer-events-none={!isVisible}
    onmousedown={onTrackClick}>
    <div
        bind:this={thumbRef}
        role="none"
        class="scrollbar-thumb-custom absolute top-0 w-1 cursor-pointer rounded-full bg-fg-muted opacity-30"
        class:bg-accent-primary={isDragging}
        class:!opacity-100={isDragging}
        class:!w-3={isDragging}
        style="height: {thumbHeight}px; transform: translateY({thumbTop}px);"
        onmousedown={onThumbMouseDown}>
    </div>
</div>
