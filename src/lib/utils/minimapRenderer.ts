import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import {
  classesToKind,
  codeBlockHighlighter,
  computeCalloutTypes,
  findCommentStart,
  getLineKind,
  minimapHighlighter,
  pickBarKind,
} from "./minimapClassify";
import { getColors } from "./minimapColors";
import { drawSpan, drawTextRun } from "./minimapDraw";
import {
  CHARS_TO_PX,
  COMPRESS_SPACING,
  fitLines,
  LINE_GAP,
  LINE_HEIGHT,
  lineToY,
  type MinimapLayout,
  minimapLineHeight,
  TEXT_MIN_FONT_PX,
} from "./minimapLayout";

const VIEWPORT_BAND_ALPHA = 0.15;

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
  const width = track.clientWidth;
  if (trackHeight === 0 || width === 0 || totalLines === 0) return null;

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

  canvas.width = width * dpr;
  canvas.height = contentH * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${contentH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return layout;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, contentH);

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, contentH);

  const scrollDOM = view.scrollDOM;
  const topLine = doc.lineAt(view.lineBlockAtHeight(scrollDOM.scrollTop).from).number - 1;
  const bottomLine = doc.lineAt(view.lineBlockAtHeight(scrollDOM.scrollTop + scrollDOM.clientHeight).from).number - 1;
  const viewportTop = lineToY(layout, topLine);
  const viewportBottom = lineToY(layout, bottomLine) + minimapLineHeight(layout);

  const paddingX = 2;
  const barWidth = width - paddingX * 2;

  // Tint the viewport under the content so it separates from the rest of the
  // track without washing out the glyph colors on top. Uses the fg color, so
  // dark themes lighten and light themes darken the band.
  const bandTop = Math.max(0, viewportTop);
  const bandBottom = Math.min(contentH, viewportBottom);
  if (bandBottom > bandTop) {
    ctx.globalAlpha = VIEWPORT_BAND_ALPHA;
    ctx.fillStyle = colors.text;
    ctx.fillRect(0, bandTop, width, bandBottom - bandTop);
    ctx.globalAlpha = 1;
  }

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
      const isComment = kind === "code" && findCommentStart(line) >= 0;
      const effKind = calloutType ? `callout-${calloutType}` : isComment ? "comment" : kind;
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
      // A span can cover several lines (a fenced code block highlights as one
      // range), so split it across every line it touches.
      for (let i = cur; i < totalLines && lineStart[i] < to; i++) {
        const s = Math.max(from, lineStart[i]);
        const e = Math.min(to, lineEnd[i]);
        if (e <= s) continue;
        tokenSpans[i].push({ from: s - lineStart[i], to: e - lineStart[i], kind });
      }
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(paddingX, 0, barWidth, contentH);
    ctx.clip();

    // Glyphs cover far less pixel area than bars and rows can shrink to 1px,
    // so the font never goes below TEXT_MIN_FONT_PX; painted bold to hold color.
    const fontFamily = getComputedStyle(view.contentDOM).fontFamily || "monospace";
    ctx.font = `700 ${Math.max(TEXT_MIN_FONT_PX, lineH)}px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    // Horizontal positions follow the painted glyph advance so text runs and
    // syntax spans stay aligned with each other.
    // shortcut: one advance for every char assumes a monospace editor font; proportional fonts drift.
    const advance = ctx.measureText("M").width || CHARS_TO_PX;

    let inCodeBlock = false;
    for (let i = 0; i < totalLines; i++) {
      const y = i * (lineH + gap);
      if (y > contentH) break;

      const inViewport = y + lineH >= viewportTop && y <= viewportBottom;
      const baseline = y + lineH;

      const line = doc.line(i + 1).text;
      const lineKind = getLineKind(line, inCodeBlock);
      inCodeBlock = lineKind.inCodeBlock;
      if (line.length === 0) continue;

      const drawRun = (kind: string, text: string, col: number) =>
        drawTextRun(ctx, kind, text, paddingX + col * advance, baseline, colors, inViewport, hovered);

      const calloutType = calloutTypes[i];

      if (calloutType) {
        drawRun(`callout-${calloutType}`, line, 0);
        continue;
      }

      // Fenced code paints from the fence state, since only the viewport is
      // syntax-parsed; comments are found by marker so the whole document colors.
      if (lineKind.kind === "code") {
        const commentStart = findCommentStart(line);
        if (commentStart < 0) {
          drawRun("code", line, 0);
        } else {
          if (commentStart > 0) drawRun("code", line.slice(0, commentStart), 0);
          drawRun("comment", line.slice(commentStart), commentStart);
        }
        continue;
      }

      // Paint one segment per span so colored tokens replace the base text
      // instead of stacking on it (overlap would smear the tiny glyphs).
      let cursor = 0;
      for (const sp of tokenSpans[i]) {
        if (sp.from > cursor) drawRun("text", line.slice(cursor, sp.from), cursor);
        drawRun(sp.kind, line.slice(sp.from, sp.to), sp.from);
        cursor = Math.max(cursor, sp.to);
      }
      if (cursor < line.length) drawRun("text", line.slice(cursor), cursor);
    }

    ctx.restore();
  }

  return layout;
}
