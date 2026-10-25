import type { MinimapColors } from "./minimapColors";

const VIEWPORT_UNHOVERED_DIM = 0.7;
/** Bar alphas are too low for thin glyphs: outside-viewport text needs to stay
 *  readable, it is only a hint of context, not a dimmed bar. */
const TEXT_OUTSIDE_VIEWPORT_ALPHA = 0.7;

interface SpanStyle {
  color: string;
  alpha: number;
}

function resolveStyle(
  kind: string,
  colors: MinimapColors,
  inViewport: boolean,
  hovered: boolean,
  fade: number,
): SpanStyle {
  let color: string;
  let alpha: number;

  switch (kind) {
    case "heading":
      color = colors.heading;
      alpha = inViewport ? 1 : 0.35 * fade;
      break;
    case "code":
      color = colors.code;
      alpha = inViewport ? 0.9 : 0.35 * fade;
      break;
    case "comment":
      color = colors.comment;
      alpha = inViewport ? 0.8 : 0.25 * fade;
      break;
    case "list":
      color = colors.list;
      alpha = inViewport ? 0.85 : 0.25 * fade;
      break;
    case "link":
      color = colors.link;
      alpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case "url":
      color = colors.url;
      alpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case "quote":
      color = colors.quote;
      alpha = inViewport ? 0.85 : 0.25 * fade;
      break;
    case "callout-note":
    case "callout-tip":
    case "callout-important":
    case "callout-warning":
    case "callout-caution":
      color = colors.callout[kind.slice("callout-".length)];
      alpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case "strong":
      color = colors.strong;
      alpha = inViewport ? 0.95 : 0.3 * fade;
      break;
    case "emphasis":
      color = colors.emphasis;
      alpha = inViewport ? 0.85 : 0.28 * fade;
      break;
    case "strike":
      color = colors.strike;
      alpha = inViewport ? 0.6 : 0.2 * fade;
      break;
    default:
      color = colors.text;
      alpha = inViewport ? 0.7 : 0.2 * fade;
  }

  if (inViewport && !hovered) alpha *= VIEWPORT_UNHOVERED_DIM;

  return { color, alpha };
}

export function drawSpan(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: MinimapColors,
  inViewport: boolean,
  hovered: boolean,
  fade = 1,
): void {
  if (kind === "empty" || w <= 0 || h <= 0) return;

  const { color, alpha } = resolveStyle(kind, colors, inViewport, hovered, fade);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(x, y, w, h);
}

/** Paints actual text so the minimap shows word and glyph shapes instead of
 *  uniform bars. Callers set the font; baseline is the bottom of the row. */
export function drawTextRun(
  ctx: CanvasRenderingContext2D,
  kind: string,
  text: string,
  x: number,
  baselineY: number,
  colors: MinimapColors,
  inViewport: boolean,
  hovered: boolean,
): void {
  if (kind === "empty" || text.length === 0) return;

  const { color } = resolveStyle(kind, colors, inViewport, hovered, 1);
  // Sub-pixel glyph coverage eats most of a low alpha; the viewport is full
  // strength and everything else still needs enough to read.
  ctx.fillStyle = color;
  ctx.globalAlpha = inViewport ? 1 : TEXT_OUTSIDE_VIEWPORT_ALPHA;
  ctx.fillText(text, x, baselineY);
}
