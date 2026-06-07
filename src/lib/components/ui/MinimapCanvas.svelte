<script lang="ts">
import type { EditorView } from '@codemirror/view';
import { appContext } from '$lib/stores/state.svelte.ts';
import { buildMinimapData, drawMinimap } from '$lib/utils/minimapRenderer';

interface Props {
    viewport: HTMLElement | null;
    editorView: EditorView | null;
}

let { viewport, editorView }: Props = $props();

let canvasRef = $state<HTMLCanvasElement>();
let docVersion = $state(0);

function rebuild() {
    if (!editorView || !canvasRef || !viewport) return;
    if (!appContext.app.minimapEnabled) return;
    try {
        const data = buildMinimapData(editorView);
        drawMinimap(canvasRef, data, viewport.clientHeight, viewport.scrollHeight, viewport.scrollTop, appContext.app.minimapWidth);
    } catch {
        // minimap rendering error — silently skip
    }
}

function onContentChanged() {
    if (!editorView || !appContext.app.minimapEnabled) return;
    const newVersion = editorView.state.doc.lines + editorView.state.doc.toString().length;
    if (newVersion !== docVersion) {
        docVersion = newVersion;
        rebuild();
    }
}

function onScroll() {
    if (!canvasRef || !viewport || !appContext.app.minimapEnabled) return;
    requestAnimationFrame(() => {
        if (!canvasRef || !viewport || !editorView) return;
        try {
            const data = buildMinimapData(editorView);
            drawMinimap(canvasRef, data, viewport.clientHeight, viewport.scrollHeight, viewport.scrollTop, appContext.app.minimapWidth);
        } catch {
            // skip
        }
    });
}

$effect(() => {
    if (!viewport || !editorView) return;

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(rebuild));
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild);

    viewport.addEventListener('scroll', onScroll, { passive: true });

    rebuild();

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
    if (editorView && appContext.app.minimapEnabled) rebuild();
});
</script>

{#if appContext.app.minimapEnabled}
    <canvas
        bind:this={canvasRef}
        class="pointer-events-none absolute z-60"
        style="top: 0; right: 18px; bottom: 0;"
        style:width="{appContext.app.minimapWidth}px"></canvas>
{/if}
