<script lang="ts">
    import { onDestroy } from "svelte";

    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
    }

    let { viewport, content }: Props = $props();

    let trackRef = $state<HTMLDivElement>();
    let thumbHeight = $state(20);
    let thumbTop = $state(0);
    let isVisible = $state(false);
    let isDragging = $state(false);
    let startY = 0;
    let startThumbTop = 0;

    let resizeObserver: ResizeObserver;
    let mutationObserver: MutationObserver;

    async function updateMetrics() {
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        const viewHeight = rect.height;
        const scrollHeight = viewport.scrollHeight;
        const scrollTop = viewport.scrollTop;

        // Safety check for invalid/hidden containers
        if (viewHeight === 0 || isNaN(viewHeight)) {
            isVisible = false;
            return;
        }

        // Determine visibility: content must be taller than viewport
        // Using 1px threshold to handle sub-pixel rounding
        const shouldBeVisible = scrollHeight > viewHeight + 1;

        if (!shouldBeVisible) {
            if (isVisible) isVisible = false;
            return;
        }

        isVisible = true;
        const trackHeight = viewHeight - 4; // 2px padding top/bottom

        // Calculate thumb height proportion
        const heightRatio = viewHeight / scrollHeight;
        // Ensure minimum thumb height (20px)
        thumbHeight = Math.max(20, trackHeight * heightRatio);

        if (!isDragging) {
            // Calculate thumb position
            const maxScroll = scrollHeight - viewHeight;
            const maxThumb = trackHeight - thumbHeight;

            if (maxScroll > 0) {
                const scrollRatio = scrollTop / maxScroll;
                thumbTop = scrollRatio * maxThumb;
            } else {
                thumbTop = 0;
            }
        }
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        const rect = trackRef.getBoundingClientRect();
        const clickOffset = e.clientY - rect.top;

        const viewHeight = viewport.clientHeight;
        const trackHeight = viewHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = viewport.scrollHeight - viewHeight;

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
        startThumbTop = thumbTop;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "default";
        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport) return;

        const deltaY = e.clientY - startY;
        const viewHeight = viewport.clientHeight;
        const trackHeight = viewHeight - 4;
        const maxThumb = trackHeight - thumbHeight;
        const maxScroll = viewport.scrollHeight - viewHeight;

        if (maxThumb > 0) {
            let newTop = startThumbTop + deltaY;
            newTop = Math.max(0, Math.min(maxThumb, newTop));

            thumbTop = newTop;

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
    }

    function setup() {
        if (!viewport) return;

        resizeObserver?.disconnect();
        mutationObserver?.disconnect();

        // 1. Observe Resize (Window/Container)
        resizeObserver = new ResizeObserver(() => requestAnimationFrame(updateMetrics));
        resizeObserver.observe(viewport);

        // 2. Observe Content Size
        if (content) {
            resizeObserver.observe(content);
        } else if (viewport.firstElementChild) {
            resizeObserver.observe(viewport.firstElementChild);
        }

        // 3. Observe Mutations (Nodes added/removed)
        mutationObserver = new MutationObserver(() => requestAnimationFrame(updateMetrics));
        mutationObserver.observe(viewport, { childList: true, subtree: true, attributes: true });

        // 4. Bind Scroll Event
        viewport.addEventListener("scroll", updateMetrics, { passive: true });
        window.addEventListener("resize", updateMetrics);

        // Initial check with retries for layout shifts
        updateMetrics();
        setTimeout(updateMetrics, 100);
        setTimeout(updateMetrics, 300);
    }

    $effect(() => {
        if (viewport) {
            setup();
            return () => {
                viewport?.removeEventListener("scroll", updateMetrics);
                window.removeEventListener("resize", updateMetrics);
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
<div bind:this={trackRef} class="scrollbar-track absolute right-0 top-[2px] bottom-[2px] z-[60] flex w-[12px] justify-center bg-transparent transition-opacity duration-200" class:opacity-0={!isVisible} class:opacity-100={isVisible} class:pointer-events-none={!isVisible} onmousedown={onTrackMouseDown}>
    <div
        class="scrollbar-thumb absolute top-0 w-[4px] rounded-full bg-[var(--color-border-light)] hover:bg-[var(--color-fg-muted)] hover:w-[6px] active:bg-[var(--color-accent-primary)] active:w-[6px] transition-all duration-150 cursor-pointer"
        class:w-[6px]={isDragging}
        class:bg-[var(--color-accent-primary)]={isDragging}
        style="
            height: {thumbHeight}px;
            transform: translateY({thumbTop}px);
        "
        onmousedown={onThumbMouseDown}
    ></div>
</div>
