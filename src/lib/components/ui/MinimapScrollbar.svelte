<script lang="ts">
import type { EditorView } from '@codemirror/view';
import { appContext } from '$lib/stores/state.svelte.ts';
import { buildMinimapData, drawMinimap, type MinimapResult } from '$lib/utils/minimapRenderer';

interface Props {
    viewport: HTMLElement | null;
    editorView: EditorView | null;
}

let { viewport, editorView }: Props = $props();

let trackRef = $state<HTMLDivElement>();
let thumbRef = $state<HTMLDivElement>();
let canvasRef = $state<HTMLCanvasElement>();
let thumbHeight = $state(20);
let thumbTop = $state(0);
let isVisible = $state(false);
let isDragging = $state(false);

let minimapData = $state<MinimapResult | null>(null);
let docVersion = $state(0);

function updateScrollbar() {
    const viewportHeight = viewport?.clientHeight ?? 0;
    const scrollHeight = viewport?.scrollHeight ?? 0;
    const scrollTop = viewport?.scrollTop ?? 0;
    const trackHeight = trackRef?.clientHeight ?? 0;

    if (!viewportHeight || !trackHeight) return;

    const shouldShow = scrollHeight > viewportHeight;
    if (isVisible !== shouldShow) isVisible = shouldShow;
    if (!isVisible) return;

    const ratio = viewportHeight / scrollHeight;
    thumbHeight = Math.max(20, trackHeight * ratio);

    const maxScroll = scrollHeight - viewportHeight;
    const maxThumbTravel = trackHeight - thumbHeight;
    thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTravel : 0;
}

function rebuildMinimap() {
    if (!editorView || !canvasRef) return;
    try {
        minimapData = buildMinimapData(editorView);
        redrawCanvas();
    } catch {
        minimapData = null;
    }
}

function redrawCanvas() {
    if (!canvasRef || !minimapData || !viewport) return;
    const width = appContext.app.minimapEnabled ? appContext.app.minimapWidth : 0;
    if (width <= 0) return;
    drawMinimap(
        canvasRef,
        minimapData,
        viewport.clientHeight,
        viewport.scrollHeight,
        viewport.scrollTop,
        width,
    );
}

function onTrackClick(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = clickY / rect.height;

    const maxScroll = (viewport?.scrollHeight ?? 0) - (viewport?.clientHeight ?? 0);
    if (viewport) viewport.scrollTop = ratio * maxScroll;
}

function onThumbMouseDown(e: MouseEvent) {
    if (!thumbRef || !trackRef) return;
    const thumbRect = thumbRef.getBoundingClientRect();
    const thumbOffset = e.clientY - thumbRect.top;
    isDragging = true;

    function onMouseMove(e: MouseEvent) {
        const trackRect = trackRef?.getBoundingClientRect();
        if (!trackRect) return;
        e.preventDefault();

        const trackHeight = trackRect.height;
        const maxThumbTravel = trackHeight - thumbHeight;
        const maxScroll = (viewport?.scrollHeight ?? 0) - (viewport?.clientHeight ?? 0);

        let newThumbTop = e.clientY - trackRect.top - thumbOffset;
        newThumbTop = Math.max(0, Math.min(maxThumbTravel, newThumbTop));
        thumbTop = newThumbTop;

        const scrollRatio = maxThumbTravel > 0 ? newThumbTop / maxThumbTravel : 0;
        if (viewport) viewport.scrollTop = scrollRatio * maxScroll;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        requestAnimationFrame(updateScrollbar);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
}

function onScroll() {
    if (!isDragging) requestAnimationFrame(updateScrollbar);
    if (appContext.app.minimapEnabled) requestAnimationFrame(redrawCanvas);
}

function onContentChanged() {
    if (!editorView) return;
    const newVersion = editorView.state.doc.lines + editorView.state.doc.toString().length;
    if (newVersion !== docVersion) {
        docVersion = newVersion;
        rebuildMinimap();
    }
}

$effect(() => {
    if (!viewport || !editorView) return;

    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
            updateScrollbar();
            if (appContext.app.minimapEnabled) {
                rebuildMinimap();
            } else {
                minimapData = null;
            }
        });
    });

    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild);

    viewport.addEventListener('scroll', onScroll, { passive: true });

    rebuildMinimap();
    updateScrollbar();

    const pollInterval = setInterval(onContentChanged, 500);

    return () => {
        resizeObserver.disconnect();
        viewport.removeEventListener('scroll', onScroll);
        clearInterval(pollInterval);
    };
});

$effect(() => {
    void appContext.app.minimapEnabled;
    void appContext.app.minimapWidth;
    if (editorView) {
        if (appContext.app.minimapEnabled) rebuildMinimap();
        else minimapData = null;
    }
});
</script>

<div
    class="scrollbar-track absolute top-0.5 right-0 bottom-0.5 z-60 flex"
    class:opacity-0={!isVisible}
    class:pointer-events-none={!isVisible}
    onmousedown={onTrackClick}>
    {#if appContext.app.minimapEnabled}
        <canvas
            bind:this={canvasRef}
            class="pointer-events-none"
            style:width="{appContext.app.minimapWidth}px"></canvas>
    {/if}
    <div
        bind:this={trackRef}
        role="none"
        class="flex w-4 shrink-0 justify-center bg-transparent">
        <div
            bind:this={thumbRef}
            role="none"
            class="scrollbar-thumb-custom absolute top-0 w-1 cursor-pointer rounded-full bg-fg-muted opacity-30"
            class:bg-accent-primary={isDragging}
            class:!opacity-100={isDragging}
            class:!w-3={isDragging}
            style="height: {thumbHeight}px; transform: translateY({thumbTop}px);"
            onmousedown={onThumbMouseDown}></div>
    </div>
</div>
