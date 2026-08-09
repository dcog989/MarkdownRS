<script lang="ts">
import { syntaxTree } from '@codemirror/language';
import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { type Highlighter, highlightTree, type Tag, tags as t } from '@lezer/highlight';
import { debounce } from '$lib/utils/timing';

interface Props {
  view: EditorView | null;
}

let { view }: Props = $props();

let canvasRef = $state<HTMLCanvasElement>();
let trackRef = $state<HTMLDivElement>();
let hovered = $state(false);

const MINIMAP_WIDTH = 64;
const LINE_HEIGHT = 2;
const LINE_GAP = 1;
const MIN_LINE_HEIGHT = 1;
const CHARS_TO_PX = 0.75;
const VIEWPORT_UNHOVERED_DIM = 0.75;
const CONTENT_RENDER_DEBOUNCE_MS = 150;

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

interface MinimapColors {
  bg: string;
  text: string;
  heading: string;
  code: string;
  list: string;
  link: string;
  quote: string;
  strong: string;
  emphasis: string;
  strike: string;
  callout: Record<string, string>;
}

function getColors(): MinimapColors {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue('--editor-bg').trim(),
    text: style.getPropertyValue('--editor-fg').trim(),
    heading: style.getPropertyValue('--editor-syntax-heading').trim(),
    code: style.getPropertyValue('--editor-code-fg').trim(),
    list: style.getPropertyValue('--editor-fg-secondary').trim(),
    link: style.getPropertyValue('--editor-link').trim(),
    quote: style.getPropertyValue('--editor-syntax-keyword').trim(),
    strong: style.getPropertyValue('--editor-syntax-strong').trim(),
    emphasis: style.getPropertyValue('--editor-syntax-emphasis').trim(),
    strike: style.getPropertyValue('--editor-fg-tertiary').trim(),
    callout: {
      note: style.getPropertyValue('--editor-callout-note-accent').trim(),
      tip: style.getPropertyValue('--editor-callout-tip-accent').trim(),
      important: style.getPropertyValue('--editor-callout-important-accent').trim(),
      warning: style.getPropertyValue('--editor-callout-warning-accent').trim(),
      caution: style.getPropertyValue('--editor-callout-caution-accent').trim(),
    },
  };
}

const LINK_RE = /\[.*?\]\(.*?\)|\[.*?\]\[.*?\]|\[.*?\]\[\s*\]|^\s*\[[^\]]+\]:\s*\S|https?:\/\/\S+/;

const calloutMarkerRe = /^\s*>\s*\[!(note|tip|important|warning|caution)\]/i;
const quoteLineRe = /^\s*>/;
const fenceRe = /^\s*(?:```|~~~)/;

function computeCalloutTypes(doc: Text): (string | null)[] {
  const types: (string | null)[] = new Array(doc.lines).fill(null);
  let current: string | null = null;
  let inFence = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i).text;
    if (fenceRe.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = calloutMarkerRe.exec(line);
    if (m) {
      current = m[1].toLowerCase();
      types[i - 1] = current;
    } else if (current && quoteLineRe.test(line)) {
      types[i - 1] = current;
    } else {
      current = null;
    }
  }
  return types;
}

const minimapHighlighter: Highlighter = {
  style(tags: readonly Tag[]) {
    const has = (target: Tag) => tags.some((tag) => tag.set.includes(target));
    if (has(t.heading)) return 'heading';
    if (has(t.monospace)) return 'code';
    if (has(t.link) || has(t.url)) return 'link';
    if (has(t.strong)) return 'strong';
    if (has(t.emphasis)) return 'emphasis';
    if (has(t.strikethrough)) return 'strike';
    if (has(t.quote)) return 'quote';
    if (has(t.list)) return 'list';
    return '';
  },
};

const codeBlockHighlighter: Highlighter = {
  style(tags: readonly Tag[]) {
    if (tags.length === 0) return '';
    const has = (target: Tag) => tags.some((tag) => tag.set.includes(target));
    if (
      has(t.heading) ||
      has(t.monospace) ||
      has(t.link) ||
      has(t.url) ||
      has(t.strong) ||
      has(t.emphasis) ||
      has(t.strikethrough) ||
      has(t.quote) ||
      has(t.list)
    )
      return '';
    return 'code';
  },
  scope: (type) => type.name !== 'Document',
};

const KIND_PRIORITY: Record<string, number> = {
  link: 6,
  strong: 5,
  emphasis: 4,
  code: 3,
  heading: 3,
  quote: 2,
  list: 1,
};

function classesToKind(classes: string): string {
  const parts = classes.split(' ');
  if (parts[0] === 'code') return 'code';
  let best = '';
  let bestPriority = -1;
  for (const p of parts) {
    const priority = KIND_PRIORITY[p];
    if (priority !== undefined && priority > bestPriority) {
      bestPriority = priority;
      best = p;
    }
  }
  return best;
}

function getLineKind(
  line: string,
  inCodeBlock: boolean,
): { kind: 'heading' | 'code' | 'list' | 'link' | 'quote' | 'empty' | 'text'; inCodeBlock: boolean } {
  if (line.trim() === '') return { kind: 'empty', inCodeBlock };

  if (/^```/.test(line)) {
    const newState = !inCodeBlock;
    return { kind: 'code', inCodeBlock: newState };
  }

  if (inCodeBlock) return { kind: 'code', inCodeBlock };

  if (/^#{1,6}\s/.test(line)) return { kind: 'heading', inCodeBlock: false };
  if (LINK_RE.test(line)) return { kind: 'link', inCodeBlock: false };
  if (/^[\s]*[-*+]\s/.test(line)) return { kind: 'list', inCodeBlock: false };
  if (/^[\s]*\d+[.)]\s/.test(line)) return { kind: 'list', inCodeBlock: false };
  if (/^\s*>\s/.test(line)) return { kind: 'quote', inCodeBlock: false };
  return { kind: 'text', inCodeBlock: false };
}

const KIND_WEIGHT: Record<string, number> = {
  heading: 6,
  link: 4,
  code: 3,
  list: 2,
  quote: 2,
  text: 0.3,
  'callout-note': 10,
  'callout-tip': 10,
  'callout-important': 10,
  'callout-warning': 10,
  'callout-caution': 10,
};

function pickBarKind(counts: Record<string, number>): string {
  let best = 'empty';
  let bestScore = 0;
  for (const [kind, count] of Object.entries(counts)) {
    if (kind === 'empty') continue;
    const score = count * (KIND_WEIGHT[kind] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  }
  return best;
}

function drawSpan(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: MinimapColors,
  inViewport: boolean,
  fade = 1,
) {
  if (kind === 'empty' || w <= 0 || h <= 0) return;

  switch (kind) {
    case 'heading':
      ctx.fillStyle = colors.heading;
      ctx.globalAlpha = inViewport ? 1 : 0.35 * fade;
      break;
    case 'code':
      ctx.fillStyle = colors.code;
      ctx.globalAlpha = inViewport ? 0.45 : 0.18 * fade;
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
    case 'callout-note':
    case 'callout-tip':
    case 'callout-important':
    case 'callout-warning':
    case 'callout-caution':
      ctx.fillStyle = colors.callout[kind.slice('callout-'.length)];
      ctx.globalAlpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case 'strong':
      ctx.fillStyle = colors.strong;
      ctx.globalAlpha = inViewport ? 0.95 : 0.3 * fade;
      break;
    case 'emphasis':
      ctx.fillStyle = colors.emphasis;
      ctx.globalAlpha = inViewport ? 0.85 : 0.28 * fade;
      break;
    case 'strike':
      ctx.fillStyle = colors.strike;
      ctx.globalAlpha = inViewport ? 0.6 : 0.2 * fade;
      break;
    default:
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = inViewport ? 0.7 : 0.2 * fade;
  }

  if (inViewport && !hovered) {
    ctx.globalAlpha *= VIEWPORT_UNHOVERED_DIM;
  }

  ctx.fillRect(x, y, w, h);
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
    ctx.fillStyle = hovered ? 'rgba(128, 128, 128, 0.35)' : 'rgba(80, 80, 80, 0.35)';
    ctx.fillRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);

    ctx.strokeStyle = hovered ? 'rgba(128, 128, 128, 0.7)' : 'rgba(80, 80, 80, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);
  }

  const paddingX = 2;
  const barWidth = MINIMAP_WIDTH - paddingX * 2;

  const COMPRESS_SPACING = 1;
  const needsCompression = lineH < 1;
  let inCodeBlock = false;
  const calloutTypes = computeCalloutTypes(doc);

  if (needsCompression) {
    const totalBars = Math.max(1, Math.floor(contentH / COMPRESS_SPACING));
    const linesPerBar = totalLines / totalBars;
    let currentBarIdx = -1;
    let counts: Record<string, number> = {};
    let barMaxLen = 0;

    const drawCompressedBar = (barIdx: number, barKind: string) => {
      if (barKind === 'empty') return;
      const barY = barIdx * COMPRESS_SPACING;
      const inViewport = barY + 1 >= viewportTop && barY <= viewportBottom;
      const barW = Math.max(1, Math.min(barWidth, barMaxLen * CHARS_TO_PX));
      drawSpan(ctx, barKind, paddingX, barY, barW, 1, colors, inViewport, 1.5);
    };

    for (let i = 1; i <= totalLines; i++) {
      const line = doc.line(i).text;
      const barIdx = Math.min(Math.floor((i - 1) / linesPerBar), totalBars - 1);

      if (barIdx !== currentBarIdx) {
        if (currentBarIdx >= 0) drawCompressedBar(currentBarIdx, pickBarKind(counts));
        currentBarIdx = barIdx;
        counts = {};
        barMaxLen = 0;
      }

      const { kind, inCodeBlock: newInCodeBlock } = getLineKind(line, inCodeBlock);
      inCodeBlock = newInCodeBlock;
      const calloutType = calloutTypes[i - 1];
      const effKind = calloutType ? `callout-${calloutType}` : kind;
      counts[effKind] = (counts[effKind] ?? 0) + 1;
      barMaxLen = Math.max(barMaxLen, line.length);
    }

    if (currentBarIdx >= 0) drawCompressedBar(currentBarIdx, pickBarKind(counts));
  } else {
    const lineStart = new Int32Array(totalLines);
    const lineEnd = new Int32Array(totalLines);
    for (let i = 0; i < totalLines; i++) {
      const line = doc.line(i + 1);
      lineStart[i] = line.from;
      lineEnd[i] = line.to;
    }

    const tokenSpans: { from: number; to: number; kind: string }[][] = new Array(totalLines);
    for (let i = 0; i < totalLines; i++) tokenSpans[i] = [];

    let cur = 0;
    highlightTree(syntaxTree(view.state), [minimapHighlighter, codeBlockHighlighter], (from, to, classes) => {
      const kind = classesToKind(classes);
      if (!kind) return;
      while (cur < totalLines && from >= lineEnd[cur]) cur++;
      if (cur >= totalLines) return;
      const ls = lineStart[cur];
      const le = lineEnd[cur];
      const s = Math.max(from, ls);
      const e = Math.min(to, le);
      if (e <= s) return;
      tokenSpans[cur].push({ from: s - ls, to: e - ls, kind });
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(paddingX, 0, barWidth, contentH);
    ctx.clip();

    for (let i = 0; i < totalLines; i++) {
      const y = i * (lineH + gap);
      if (y > contentH) break;

      const inViewport = y + lineH >= viewportTop && y <= viewportBottom;

      const line = doc.line(i + 1).text;
      if (line.length === 0) continue;

      const lineWidth = Math.max(1, Math.min(barWidth, line.length * CHARS_TO_PX));
      const calloutType = calloutTypes[i];
      if (calloutType) {
        drawSpan(ctx, `callout-${calloutType}`, paddingX, y, lineWidth, lineH, colors, inViewport);
        continue;
      }

      drawSpan(ctx, 'text', paddingX, y, lineWidth, lineH, colors, inViewport);

      for (const sp of tokenSpans[i]) {
        const x = paddingX + sp.from * CHARS_TO_PX;
        const w = (sp.to - sp.from) * CHARS_TO_PX;
        if (w <= 0) continue;
        drawSpan(ctx, sp.kind, x, y, w, lineH, colors, inViewport);
      }
    }

    ctx.restore();
  }
}

let scheduleRafId = 0;

function scheduleRender() {
  if (!view) return;
  cancelAnimationFrame(scheduleRafId);
  scheduleRafId = requestAnimationFrame(renderMinimap);
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

      const viewportH = (sd.clientHeight / sd.scrollHeight) * canvasH;
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
let themeObserver: MutationObserver;

$effect(() => {
  hovered;
  scheduleRender();
});

$effect(() => {
  if (!view) return;

  const scrollDOM = view.scrollDOM;

  resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(scrollDOM);
  if (scrollDOM.firstElementChild) {
    resizeObserver.observe(scrollDOM.firstElementChild);
  }

  scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  const debouncedContentRender = debounce(renderMinimap, CONTENT_RENDER_DEBOUNCE_MS);

  const contentEl = scrollDOM.querySelector('.cm-content');
  if (contentEl) {
    contentObserver = new MutationObserver(() => {
      debouncedContentRender();
    });
    contentObserver.observe(contentEl, { characterData: true, childList: true, subtree: true });
  }

  scheduleRender();

  let themeRafId = 0;
  themeObserver = new MutationObserver(() => {
    cancelAnimationFrame(themeRafId);
    themeRafId = requestAnimationFrame(renderMinimap);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  themeObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

  return () => {
    resizeObserver.disconnect();
    contentObserver?.disconnect();
    themeObserver.disconnect();
    scrollDOM.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(themeRafId);
    cancelAnimationFrame(scheduleRafId);
    debouncedContentRender.clear();
  };
});
</script>

<div
  bind:this={trackRef}
  role="none"
  class="minimap-track"
  class:minimap-track-hover={hovered}
  onmouseenter={() => (hovered = true)}
  onmouseleave={() => (hovered = false)}
  onmousedown={onTrackMouseDown}
  onwheel={onWheel}
>
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
  background: var(--editor-bg);
}
.minimap-track::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.05);
  transition: background 150ms ease;
}
.minimap-track-hover::after {
  background: rgba(255, 255, 255, 0.03);
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
