import type { MinimapColors } from "./minimapColors";

const VIEWPORT_UNHOVERED_DIM = 0.75;

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

  switch (kind) {
    case "heading":
      ctx.fillStyle = colors.heading;
      ctx.globalAlpha = inViewport ? 1 : 0.35 * fade;
      break;
    case "code":
      ctx.fillStyle = colors.code;
      ctx.globalAlpha = inViewport ? 0.45 : 0.18 * fade;
      break;
    case "list":
      ctx.fillStyle = colors.list;
      ctx.globalAlpha = inViewport ? 0.85 : 0.25 * fade;
      break;
    case "link":
      ctx.fillStyle = colors.link;
      ctx.globalAlpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case "quote":
      ctx.fillStyle = colors.quote;
      ctx.globalAlpha = inViewport ? 0.85 : 0.25 * fade;
      break;
    case "callout-note":
    case "callout-tip":
    case "callout-important":
    case "callout-warning":
    case "callout-caution":
      ctx.fillStyle = colors.callout[kind.slice("callout-".length)];
      ctx.globalAlpha = inViewport ? 0.9 : 0.3 * fade;
      break;
    case "strong":
      ctx.fillStyle = colors.strong;
      ctx.globalAlpha = inViewport ? 0.95 : 0.3 * fade;
      break;
    case "emphasis":
      ctx.fillStyle = colors.emphasis;
      ctx.globalAlpha = inViewport ? 0.85 : 0.28 * fade;
      break;
    case "strike":
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
