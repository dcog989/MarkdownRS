<script lang="ts">
import type { EditorView } from '@codemirror/view';

interface Props {
    view: EditorView | null;
}

let { view }: Props = $props();

let canvasRef = $state<HTMLCanvasElement>();
let trackRef = $state<HTMLDivElement>();

const MINIMAP_WIDTH = 64;
const LINE_HEIGHT = 2;
const LINE_GAP = 1;
const MIN_LINE_HEIGHT = 1;

function fitLines(
    availableHeight: number,
    lineCount: number,
    maxLineH: number,
    maxGap: number,
): { lineH: number; gap: number } {
    if (lineCount <= 1) return { lineH: availableHeight, gap: 0 };

    const ideal = lineCount * (maxLineH + maxGap);
    if (ideal <= availableHeight) return { lineH: maxLineH, gap: maxGap };

    const shrinkGap = Math.max(0, (availableHeight - lineCount * MIN_LINE_HEIGHT) / (lineCount - 1));
    const gap = Math.min(maxGap, shrinkGap);
    const lineH = (availableHeight - gap * (lineCount - 1)) / lineCount;
    return { lineH, gap };
}

function getColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        bg: style.getPropertyValue('--surface-1').trim() || '#1e1e1e',
        text: style.getPropertyValue('--text-primary').trim() || '#888',
        heading: style.getPropertyValue('--syntax-heading').trim() || '#d32f2f',
        code: style.getPropertyValue('--code-fg').trim() || '#888',
        list: style.getPropertyValue('--text-secondary').trim() || '#888',
        link: style.getPropertyValue('--accent-link').trim() || '#61afef',
        quote: style.getPropertyValue('--syntax-keyword').trim() || '#c678dd',
    };
}

const LINK_RE = /\[.*?\]\(.*?\)|\[.*?\]\[.*?\]|\[.*?\]\[\s*\]|^\s*\[[^\]]+\]:\s*\S|https?:\/\/\S+/;

function getLineKind(line: string, inCodeBlock: boolean): { kind: 'heading' | 'code' | 'list' | 'link' | 'quote' | 'empty' | 'text'; inCodeBlock: boolean } {
    if (line.trim() === '') return { kind: 'empty', inCodeBlock };

    if (/^```/.test(line)) {
        const newState = !inCodeBlock;
        return { kind: 'code', inCodeBlock: newState };
    }

    if (inCodeBlock) return { kind: 'code', inCodeBlock };

    if (/^#{1,6}\s/.test(line)) return { kind: 'heading', inCodeBlock: false };
    if (/^[\s]*[-*+]\s/.test(line)) return { kind: 'list', inCodeBlock: false };
    if (/^[\s]*\d+[.)]\s/.test(line)) return { kind: 'list', inCodeBlock: false };
    if (/^\s*>\s/.test(line)) return { kind: 'quote', inCodeBlock: false };
    if (LINK_RE.test(line)) return { kind: 'link', inCodeBlock: false };
    return { kind: 'text', inCodeBlock: false };
}

function majorityKind(counts: Record<string, number>): string {
    const total = counts.heading + counts.code + counts.list + counts.link + counts.quote + counts.text;
    if (total === 0) return 'empty';

    const threshold = total / 2;
    if (counts.heading > threshold) return 'heading';
    if (counts.code > threshold) return 'code';
    if (counts.list > threshold) return 'list';
    if (counts.link > threshold) return 'link';
    if (counts.quote > threshold) return 'quote';
    return 'text';
}

function drawBar(
    ctx: CanvasRenderingContext2D,
    kind: string,
    y: number,
    h: number,
    colors: Record<string, string>,
    inViewport: boolean,
    barWidth: number,
    paddingX: number,
    compressed?: boolean,
) {
    if (kind === 'empty') return;

    const fade = compressed ? 1.5 : 1;

    switch (kind) {
        case 'heading':
            ctx.fillStyle = colors.heading;
            ctx.globalAlpha = inViewport ? 1 : 0.35 * fade;
            break;
        case 'code':
            ctx.fillStyle = colors.code;
            ctx.globalAlpha = inViewport ? 0.9 : 0.3 * fade;
            break;
        case 'list':
            ctx.fillStyle = colors.list;
            ctx.globalAlpha = inViewport ? 0.85 : 0.25 * fade;
            break;
        case 'link':
            ctx.fillStyle = colors.link;
            ctx.globalAlpha = inViewport ? 0.9 : 0.3 * fade;
            break;
        case 'quote':
            ctx.fillStyle = colors.quote;
            ctx.globalAlpha = inViewport ? 0.85 : 0.25 * fade;
            break;
        default:
            ctx.fillStyle = colors.text;
            ctx.globalAlpha = inViewport ? 0.7 : 0.2 * fade;
    }

    ctx.fillRect(paddingX, y, barWidth, h);
}

function renderMinimap() {
    if (!view || !canvasRef || !trackRef) return;

    const doc = view.state.doc;
    const totalLines = doc.lines;
    const trackHeight = trackRef.clientHeight;
    if (trackHeight === 0 || totalLines === 0) return;

    const colors = getColors();
    const canvas = canvasRef;
    const dpr = window.devicePixelRatio || 1;

    const contentH = Math.min(trackHeight, Math.max(1, totalLines * (LINE_HEIGHT + LINE_GAP)));
    const { lineH, gap } = fitLines(contentH, totalLines, LINE_HEIGHT, LINE_GAP);

    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = contentH * dpr;
    canvas.style.width = `${MINIMAP_WIDTH}px`;
    canvas.style.height = `${contentH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, MINIMAP_WIDTH, contentH);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, MINIMAP_WIDTH, contentH);

    const scrollDOM = view.scrollDOM;
    const scrollTop = scrollDOM.scrollTop;
    const scrollHeight = scrollDOM.scrollHeight;
    const clientHeight = scrollDOM.clientHeight;

    const viewportTop = scrollHeight > 0 ? (scrollTop / scrollHeight) * contentH : 0;
    const viewportBottom = scrollHeight > 0 ? ((scrollTop + clientHeight) / scrollHeight) * contentH : contentH;

    if (scrollHeight > clientHeight) {
        ctx.fillStyle = 'rgba(128, 128, 128, 0.35)';
        ctx.fillRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);

        ctx.strokeStyle = 'rgba(128, 128, 128, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);
    }

    const paddingX = 2;
    const barWidth = MINIMAP_WIDTH - paddingX * 2;

    const COMPRESS_SPACING = 2;
    const needsCompression = lineH < 1;
    let inCodeBlock = false;

    if (needsCompression) {
        const totalBars = Math.max(1, Math.floor(contentH / COMPRESS_SPACING));
        const linesPerBar = totalLines / totalBars;
        let currentBarIdx = -1;
        let counts = { heading: 0, code: 0, list: 0, link: 0, quote: 0, text: 0, empty: 0 };

        for (let i = 1; i <= totalLines; i++) {
            const barIdx = Math.min(Math.floor((i - 1) / linesPerBar), totalBars - 1);

            if (barIdx !== currentBarIdx) {
                if (currentBarIdx >= 0) {
                    const barKind = majorityKind(counts);
                    if (barKind !== 'empty') {
                        const barY = currentBarIdx * COMPRESS_SPACING;
                        const inViewport = barY + 1 >= viewportTop && barY <= viewportBottom;
                        drawBar(ctx, barKind, barY, 1, colors, inViewport, barWidth, paddingX, true);
                    }
                }
                currentBarIdx = barIdx;
                counts = { heading: 0, code: 0, list: 0, link: 0, quote: 0, text: 0, empty: 0 };
            }

            const line = doc.line(i).text;
            const { kind, inCodeBlock: newInCodeBlock } = getLineKind(line, inCodeBlock);
            inCodeBlock = newInCodeBlock;
            counts[kind]++;
        }

        if (currentBarIdx >= 0) {
            const barKind = majorityKind(counts);
            if (barKind !== 'empty') {
                const barY = currentBarIdx * COMPRESS_SPACING;
                const inViewport = barY + 1 >= viewportTop && barY <= viewportBottom;
                drawBar(ctx, barKind, barY, 1, colors, inViewport, barWidth, paddingX, true);
            }
        }
    } else {
        for (let i = 1; i <= totalLines; i++) {
            const y = (i - 1) * (lineH + gap);
            if (y > contentH) break;

            const inViewport = y + lineH >= viewportTop && y <= viewportBottom;

            const line = doc.line(i).text;
            const { kind, inCodeBlock: newInCodeBlock } = getLineKind(line, inCodeBlock);
            inCodeBlock = newInCodeBlock;

            drawBar(ctx, kind, y, lineH, colors, inViewport, barWidth, paddingX);
        }
    }
}

function scheduleRender() {
    if (!view) return;
    requestAnimationFrame(renderMinimap);
}

function onTrackMouseDown(e: MouseEvent) {
    if (!trackRef || !view) return;
    e.preventDefault();

    const sd = view.scrollDOM;
    const cv = canvasRef;
    const canvasH = cv?.clientHeight ?? 0;
    if (canvasH === 0) return;
    const startY = e.clientY;
    const startScrollTop = sd.scrollTop;
    const maxScroll = sd.scrollHeight - sd.clientHeight;
    let moved = false;

    function onMouseMove(e: MouseEvent) {
        moved = true;
        const dy = e.clientY - startY;
        const scrollDelta = (dy / canvasH) * sd.scrollHeight;
        sd.scrollTop = Math.max(0, Math.min(maxScroll, startScrollTop + scrollDelta));
    }

    function onMouseUp(e: MouseEvent) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';

        if (!moved && canvasRef) {
            const rect = canvasRef.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const canvasH = rect.height;
            let ratio = Math.max(0, Math.min(1, clickY / canvasH));

            const viewportH = sd.clientHeight / sd.scrollHeight * canvasH;
            const edgeSnap = viewportH / canvasH;
            if (ratio < edgeSnap) ratio = 0;
            else if (ratio > 1 - edgeSnap) ratio = 1;

            sd.scrollTop = ratio * (sd.scrollHeight - sd.clientHeight);
        }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
}

function onWheel(e: WheelEvent) {
    if (!view) return;
    e.preventDefault();

    let { deltaY, deltaX } = e;

    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        const lineH = view.defaultLineHeight;
        deltaY *= lineH;
        deltaX *= lineH;
    } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        const pageH = view.scrollDOM.clientHeight;
        deltaY *= pageH;
        deltaX *= pageH;
    }

    view.scrollDOM.scrollBy({ top: deltaY, left: deltaX });
}

function onScroll() {
    scheduleRender();
}

let resizeObserver: ResizeObserver;
let contentObserver: MutationObserver;

$effect(() => {
    if (!view) return;

    const scrollDOM = view.scrollDOM;

    resizeObserver = new ResizeObserver(() => scheduleRender());
    resizeObserver.observe(scrollDOM);
    if (scrollDOM.firstElementChild) {
        resizeObserver.observe(scrollDOM.firstElementChild);
    }

    scrollDOM.addEventListener('scroll', onScroll, { passive: true });

    let mutationRafId = 0;

    const contentEl = scrollDOM.querySelector('.cm-content');
    if (contentEl) {
        contentObserver = new MutationObserver(() => {
            cancelAnimationFrame(mutationRafId);
            mutationRafId = requestAnimationFrame(renderMinimap);
        });
        contentObserver.observe(contentEl, { characterData: true, childList: true, subtree: true });
    }

    scheduleRender();

    return () => {
        resizeObserver.disconnect();
        contentObserver?.disconnect();
        scrollDOM.removeEventListener('scroll', onScroll);
    };
});
</script>

<div
    bind:this={trackRef}
    role="none"
    class="minimap-track"
    onmousedown={onTrackMouseDown}
    onwheel={onWheel}>
    <canvas bind:this={canvasRef} class="minimap-canvas"></canvas>
</div>

<style>
    .minimap-track {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 60;
        width: 64px;
        overflow: hidden;
    }
    .minimap-canvas {
        display: block;
        pointer-events: none;
        image-rendering: auto;
        position: absolute;
        top: 0;
        left: 0;
    }
</style>
