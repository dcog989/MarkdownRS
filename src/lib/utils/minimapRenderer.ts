import { syntaxTree } from "@codemirror/language";
import type { Text } from "@codemirror/state";
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

interface CachedBar {
  index: number;
  kind: string;
  maxLen: number;
}

interface CachedRun {
  kind: string;
  text: string;
  col: number;
}

interface CachedContent {
  doc: Text;
  tree: ReturnType<typeof syntaxTree> | null;
  fontFamily: string | null;
  compressed: boolean;
  lineH: number;
  gap: number;
  totalBars: number;
  linesPerBar: number;
  bars: CachedBar[] | null;
  lines: CachedRun[][] | null;
}

/**
 * Scroll frames redraw the same document at the same layout, so the per-line
 * scan is kept until the document, syntax tree, font or box size changes.
 */
let cachedContent: CachedContent | null = null;

function buildCompressedBars(doc: Text, totalLines: number, linesPerBar: number, totalBars: number): CachedBar[] {
  const bars: CachedBar[] = [];
  const calloutTypes = computeCalloutTypes(doc);
  let inCodeBlock = false;
  let currentBarIdx = -1;
  let counts: Record<string, number> = {};
  let barMaxLen = 0;

  const flushBar = () => {
    if (currentBarIdx >= 0) bars.push({ index: currentBarIdx, kind: pickBarKind(counts), maxLen: barMaxLen });
  };

  for (let i = 1; i <= totalLines; i++) {
    const line = doc.line(i).text;
    const barIdx = Math.min(Math.floor((i - 1) / linesPerBar), totalBars - 1);

    if (barIdx !== currentBarIdx) {
      flushBar();
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

  flushBar();
  return bars;
}

function buildLineRuns(doc: Text, totalLines: number, tree: ReturnType<typeof syntaxTree>): CachedRun[][] {
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
  highlightTree(tree, [minimapHighlighter, codeBlockHighlighter], (from, to, classes) => {
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

  const calloutTypes = computeCalloutTypes(doc);
  const lines: CachedRun[][] = new Array(totalLines);
  let inCodeBlock = false;

  for (let i = 0; i < totalLines; i++) {
    const text = doc.line(i + 1).text;
    const lineKind = getLineKind(text, inCodeBlock);
    inCodeBlock = lineKind.inCodeBlock;

    const runs: CachedRun[] = [];
    lines[i] = runs;
    if (text.length === 0) continue;

    const calloutType = calloutTypes[i];
    if (calloutType) {
      runs.push({ kind: `callout-${calloutType}`, text, col: 0 });
      continue;
    }

    // Fenced code paints from the fence state, since only the viewport is
    // syntax-parsed; comments are found by marker so the whole document colors.
    if (lineKind.kind === "code") {
      const commentStart = findCommentStart(text);
      if (commentStart < 0) {
        runs.push({ kind: "code", text, col: 0 });
      } else {
        if (commentStart > 0) runs.push({ kind: "code", text: text.slice(0, commentStart), col: 0 });
        runs.push({ kind: "comment", text: text.slice(commentStart), col: commentStart });
      }
      continue;
    }

    // Paint one segment per span so colored tokens replace the base text
    // instead of stacking on it (overlap would smear the tiny glyphs).
    let cursor = 0;
    for (const sp of tokenSpans[i]) {
      if (sp.from > cursor) runs.push({ kind: "text", text: text.slice(cursor, sp.from), col: cursor });
      runs.push({ kind: sp.kind, text: text.slice(sp.from, sp.to), col: sp.from });
      cursor = Math.max(cursor, sp.to);
    }
    if (cursor < text.length) runs.push({ kind: "text", text: text.slice(cursor), col: cursor });
  }

  return lines;
}

function getContent(view: EditorView, totalLines: number, layout: MinimapLayout): CachedContent {
  const { compressed, lineH, gap, totalBars, linesPerBar } = layout;
  const doc = view.state.doc;
  const tree = compressed ? null : syntaxTree(view.state);
  const fontFamily = compressed ? null : getComputedStyle(view.contentDOM).fontFamily || "monospace";

  const cached = cachedContent;
  if (
    cached &&
    cached.doc === doc &&
    cached.tree === tree &&
    cached.fontFamily === fontFamily &&
    cached.compressed === compressed &&
    cached.lineH === lineH &&
    cached.gap === gap &&
    cached.totalBars === totalBars &&
    cached.linesPerBar === linesPerBar
  ) {
    return cached;
  }

  const content: CachedContent = {
    doc,
    tree,
    fontFamily,
    compressed,
    lineH,
    gap,
    totalBars,
    linesPerBar,
    bars: null,
    lines: null,
  };
  if (compressed) {
    content.bars = buildCompressedBars(doc, totalLines, linesPerBar, totalBars);
  } else if (tree) {
    content.lines = buildLineRuns(doc, totalLines, tree);
  }
  cachedContent = content;
  return content;
}

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

  // Reassigning the backing store reallocates it, so only resize when the box
  // actually changed: scroll frames redraw at the same size.
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(contentH * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${contentH}px`;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return layout;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  const content = getContent(view, totalLines, layout);

  if (content.bars) {
    for (const bar of content.bars) {
      if (bar.kind === "empty") continue;
      const barY = bar.index * COMPRESS_SPACING;
      const inViewport = barY + 1 >= viewportTop && barY <= viewportBottom;
      const barW = Math.max(1, Math.min(barWidth, bar.maxLen * CHARS_TO_PX));
      drawSpan(ctx, bar.kind, paddingX, barY, barW, 1, colors, inViewport, hovered, 1.5);
    }
  } else if (content.lines) {
    const lines = content.lines;
    ctx.save();
    ctx.beginPath();
    ctx.rect(paddingX, 0, barWidth, contentH);
    ctx.clip();

    // Glyphs cover far less pixel area than bars and rows can shrink to 1px,
    // so the font never goes below TEXT_MIN_FONT_PX; painted bold to hold color.
    ctx.font = `700 ${Math.max(TEXT_MIN_FONT_PX, lineH)}px ${content.fontFamily ?? "monospace"}`;
    ctx.textBaseline = "alphabetic";
    // Horizontal positions follow the painted glyph advance so text runs and
    // syntax spans stay aligned with each other.
    // shortcut: one advance for every char assumes a monospace editor font; proportional fonts drift.
    const advance = ctx.measureText("M").width || CHARS_TO_PX;

    for (let i = 0; i < lines.length; i++) {
      const y = i * (lineH + gap);
      if (y > contentH) break;

      const runs = lines[i];
      if (runs.length === 0) continue;

      const inViewport = y + lineH >= viewportTop && y <= viewportBottom;
      const baseline = y + lineH;
      for (const run of runs) {
        drawTextRun(ctx, run.kind, run.text, paddingX + run.col * advance, baseline, colors, inViewport, hovered);
      }
    }

    ctx.restore();
  }

  return layout;
}
