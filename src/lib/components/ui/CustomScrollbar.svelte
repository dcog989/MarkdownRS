<script lang="ts">
    import { onDestroy } from "svelte";

    interface Props {
        viewport: HTMLElement | null;
        content?: HTMLElement | null;
    }

    let { viewport, content }: Props = $props();

    let trackRef: HTMLDivElement;

    let thumbHeight = $state(30);
    let thumbTop = $state(0);
    let isVisible = $state(false);
    let isDragging = $state(false);

    // Non-reactive dimension cache
    let ch = 0;
    let sh = 0;
    let startY = 0;
    let startScrollTop = 0;
    let resizeObserver: ResizeObserver;
    let rafId: number | null = null;
    let pendingThumbTop: number | null = null;

    function update() {
        // Guard: Don't run update logic during drag to prevent CPU spikes and fighting
        if (!viewport || isDragging) return;

        const clientHeight = ch || viewport.clientHeight;
        const scrollHeight = sh || viewport.scrollHeight;
        const scrollTop = viewport.scrollTop;

        if (scrollHeight <= clientHeight + 2) {
            if (isVisible) isVisible = false;
            return;
        }

        if (!isVisible) isVisible = true;
        const ratio = clientHeight / scrollHeight;
        thumbHeight = Math.max(30, clientHeight * ratio);

        const maxScroll = scrollHeight - clientHeight;
        const maxThumb = clientHeight - thumbHeight;

        if (maxScroll > 0) {
            thumbTop = (scrollTop / maxScroll) * maxThumb;
        }
    }

    function onTrackMouseDown(e: MouseEvent) {
        if (!viewport || !trackRef || (e.target as Element).closest(".scrollbar-thumb")) return;
        e.preventDefault();

        const rect = trackRef.getBoundingClientRect();
        const clickOffset = e.clientY - rect.top;
        const maxThumb = (ch || viewport.clientHeight) - thumbHeight;
        const newThumbTop = Math.max(0, Math.min(maxThumb, clickOffset - thumbHeight / 2));

        const maxScroll = (sh || viewport.scrollHeight) - (ch || viewport.clientHeight);

        // Use auto behavior for instant jump on track click
        viewport.scrollTo({
            top: (newThumbTop / maxThumb) * maxScroll,
            behavior: "auto",
        });
    }

    function onThumbMouseDown(e: MouseEvent) {
        if (!viewport) return;
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        startY = e.clientY;
        startScrollTop = viewport.scrollTop;

        ch = viewport.clientHeight;
        sh = viewport.scrollHeight;

        // Force 'auto' behavior during drag to lock thumb to cursor and eliminate CPU spikes
        viewport.style.scrollBehavior = "auto";
        document.body.style.userSelect = "none";

        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !viewport || !trackRef) return;

        const deltaY = e.clientY - startY;
        const maxThumb = ch - thumbHeight;
        const maxScroll = sh - ch;

        if (maxThumb > 0) {
            const scrollPos = startScrollTop + deltaY * (maxScroll / maxThumb);
            const clampedScroll = Math.max(0, Math.min(maxScroll, scrollPos));

            viewport.scrollTop = clampedScroll;
            const newThumbTop = (clampedScroll / maxScroll) * maxThumb;

            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    thumbTop = pendingThumbTop !== null ? pendingThumbTop : newThumbTop;

                    const thumbEl = trackRef.querySelector(".scrollbar-thumb") as HTMLElement;
                    if (thumbEl) {
                        thumbEl.style.top = `${thumbTop}px`;
                    }

                    pendingThumbTop = null;
                    rafId = null;
                });
            }
            pendingThumbTop = newThumbTop;
        }
    }

    function onMouseUp() {
        isDragging = false;

        if (pendingThumbTop !== null) {
            thumbTop = pendingThumbTop;
            pendingThumbTop = null;
        }

        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        if (viewport) {
            viewport.style.scrollBehavior = "";
        }
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        update();
    }

    function attachListeners(el: HTMLElement) {
        el.addEventListener("scroll", update, { passive: true });

        if (resizeObserver) resizeObserver.disconnect();
        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === el) ch = entry.contentRect.height;
            }
            sh = el.scrollHeight;
            update();
        });

        resizeObserver.observe(el);
        if (content) resizeObserver.observe(content);
        else if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);

        ch = el.clientHeight;
        sh = el.scrollHeight;
        update();
    }

    $effect(() => {
        if (viewport) {
            attachListeners(viewport);
            return () => {
                viewport?.removeEventListener("scroll", update);
                resizeObserver?.disconnect();
                if (rafId !== null) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
            };
        }
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        }
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
        }
        resizeObserver?.disconnect();
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={trackRef} class="group scrollbar-track absolute right-0 top-0 bottom-0 z-50 flex w-[14px] justify-center bg-transparent transition-[background-color] duration-200 hover:bg-white/4" class:hidden={!isVisible} onmousedown={onTrackMouseDown}>
    <div
        class="scrollbar-thumb absolute w-[6px] rounded-full bg-[var(--color-border-light)] transition-[width,background-color] duration-200 group-hover:w-[10px] group-hover:bg-white/24 active:bg-[var(--color-accent-primary)]"
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
