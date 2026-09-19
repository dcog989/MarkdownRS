import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import {
  classesToKind,
  codeBlockHighlighter,
  computeCalloutTypes,
  getLineKind,
  minimapHighlighter,
  pickBarKind,
} from "./minimapClassify";
import { getColors } from "./minimapColors";
import { drawSpan } from "./minimapDraw";
import {
  CHARS_TO_PX,
  COMPRESS_SPACING,
  fitLines,
  LINE_GAP,
  LINE_HEIGHT,
  lineToY,
  MINIMAP_WIDTH,
  type MinimapLayout,
  minimapLineHeight,
} from "./minimapLayout";

export function renderMinimap(
  view: EditorView | null,
  canvas: HTMLCanvasElement | null | undefined,
  track: HTMLElement | null | undefined,
  hovered: boolean,
): MinimapLayout | null {
  if (!view || !canvas || !track) return null;

  const doc = view.state.doc;
  const totalLines = doc.lines;
  const trackHeight = track.clientHeight;
  if (trackHeight === 0 || totalLines === 0) return null;

  const colors = getColors();
  const dpr = window.devicePixelRatio || 1;

  const contentH = Math.min(trackHeight, Math.max(1, totalLines * (LINE_HEIGHT + LINE_GAP)));
  const { lineH, gap } = fitLines(contentH, totalLines, LINE_HEIGHT, LINE_GAP);

  const compressed = lineH < 1;
  const totalBars = compressed ? Math.max(1, Math.floor(contentH / COMPRESS_SPACING)) : 1;
  const layout: MinimapLayout = {
    totalLines,
    compressed,
    lineH,
    gap,
    totalBars,
    linesPerBar: compressed ? totalLines / totalBars : totalLines,
  };

  canvas.width = MINIMAP_WIDTH * dpr;
  canvas.height = contentH * dpr;
  canvas.style.width = `${MINIMAP_WIDTH}px`;
  canvas.style.height = `${contentH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return layout;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, MINIMAP_WIDTH, contentH);

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, MINIMAP_WIDTH, contentH);

  const scrollDOM = view.scrollDOM;
  const scrollTop = scrollDOM.scrollTop;
  const clientHeight = scrollDOM.clientHeight;
  const canScroll = scrollDOM.scrollHeight > clientHeight;

  const topLine = doc.lineAt(view.lineBlockAtHeight(scrollTop).from).number - 1;
  const bottomLine = doc.lineAt(view.lineBlockAtHeight(scrollTop + clientHeight).from).number - 1;
  const viewportTop = lineToY(layout, topLine);
  const viewportBottom = lineToY(layout, bottomLine) + minimapLineHeight(layout);

  if (canScroll) {
    ctx.fillStyle = hovered ? "rgba(128, 128, 128, 0.35)" : "rgba(80, 80, 80, 0.35)";
    ctx.fillRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);

    ctx.strokeStyle = hovered ? "rgba(128, 128, 128, 0.7)" : "rgba(80, 80, 80, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, viewportTop, MINIMAP_WIDTH, viewportBottom - viewportTop);
  }

  const paddingX = 2;
  const barWidth = MINIMAP_WIDTH - paddingX * 2;

  let inCodeBlock = false;
  const calloutTypes = computeCalloutTypes(doc);

  if (compressed) {
    let currentBarIdx = -1;
    let counts: Record<string, number> = {};
    let barMaxLen = 0;

    const drawCompressedBar = (barIdx: number, barKind: string) => {
      if (barKind === "empty") return;
      const barY = barIdx * COMPRESS_SPACING;
      const inViewport = barY + 1 >= viewportTop && barY <= viewportBottom;
      const barW = Math.max(1, Math.min(barWidth, barMaxLen * CHARS_TO_PX));
      drawSpan(ctx, barKind, paddingX, barY, barW, 1, colors, inViewport, hovered, 1.5);
    };

    for (let i = 1; i <= totalLines; i++) {
      const line = doc.line(i).text;
      const barIdx = Math.min(Math.floor((i - 1) / layout.linesPerBar), layout.totalBars - 1);

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
        drawSpan(ctx, `callout-${calloutType}`, paddingX, y, lineWidth, lineH, colors, inViewport, hovered);
        continue;
      }

      drawSpan(ctx, "text", paddingX, y, lineWidth, lineH, colors, inViewport, hovered);

      for (const sp of tokenSpans[i]) {
        const x = paddingX + sp.from * CHARS_TO_PX;
        const w = (sp.to - sp.from) * CHARS_TO_PX;
        if (w <= 0) continue;
        drawSpan(ctx, sp.kind, x, y, w, lineH, colors, inViewport, hovered);
      }
    }

    ctx.restore();
  }

  return layout;
}
