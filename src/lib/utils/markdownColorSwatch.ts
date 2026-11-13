import type { Line } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { colordx, extend } from "@colordx/core";
import cmyk from "@colordx/core/plugins/cmyk";
import { hsvToRgbChannels } from "@colordx/core/plugins/hsv";
import { okhslToRgbChannels } from "@colordx/core/plugins/okhsl";
import { okhsvToRgbChannels } from "@colordx/core/plugins/okhsv";
import { type DecorationWalk, isInsideNode, isVisibleInCodeBlock } from "./markdownDecorationCore";

/**
 * Color literals surfaced as an inline swatch in rendered mode. CSS formats are
 * passed through for the WebView to parse; device-cmyk, Okhsl, Okhsv, HSV and
 * HSB are not reliably supported, so colordx converts them to sRGB.
 */
const COLOR_LITERAL_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|hsva?|hsba?|hwb|lab|lch|oklab|oklch|okhsl|okhsv|device-cmyk|cmyk|color)\([^()\n]*\)/gi;

/** The scanner regex anchored to a whole string, so lookalikes like `not-a-color()` are rejected. */
const SINGLE_LITERAL_RE = new RegExp(`^(?:${COLOR_LITERAL_RE.source})$`, "i");
const FUNCTION_RE = /^([a-z-]+)\(([^()]*)\)$/i;
const CONVERTED_FUNCTIONS = new Set(["okhsl", "okhsv", "hsv", "hsb", "cmyk", "device-cmyk"]);

// The CMYK parser is opt-in; register it once for device-cmyk() and cmyk().
extend([cmyk]);

/** Ancestors whose text should never receive a swatch (links, code, raw HTML). */
const SKIP_ANCESTORS = new Set(["Link", "Image", "Autolink", "URL", "HTMLBlock", "HTMLTag", "Comment"]);

class ColorSwatchWidget extends WidgetType {
  constructor(private readonly color: string) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-color-swatch";
    span.setAttribute("aria-hidden", "true");
    span.style.backgroundColor = this.color;
    // The WebView reports an empty value for CSS it cannot parse; hide the
    // swatch rather than leaving an unstyled box behind.
    if (!span.style.backgroundColor) {
      span.classList.add("cm-color-swatch-invalid");
    }
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** `#` must start a token; functions must not read as the tail of an identifier. */
function hasValidBoundary(text: string, index: number, isHex: boolean): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return isHex ? !/[0-9a-zA-Z#]/.test(prev) : !/[0-9a-zA-Z-]/.test(prev);
}

/**
 * Appends a prefix swatch decoration for every color literal on the line. In
 * prose, skips links and raw HTML; code is included so code snippets show their
 * colors too.
 */
export function collectColorSwatches(walk: DecorationWalk, line: Line): void {
  if (!walk.colorSwatches) return;

  for (const { literal, index } of findColorLiterals(line.text)) {
    const start = line.from + index;
    // A code block's language parser can emit nodes named Comment/URL; those
    // must not hide a swatch inside code.
    if (!isVisibleInCodeBlock(walk.tree, start) && isInsideNode(walk.tree, start, SKIP_ANCESTORS)) continue;
    const color = resolveSwatchColor(literal);
    if (!color) continue;
    walk.ranges.push(Decoration.widget({ widget: new ColorSwatchWidget(color), side: -1 }).range(start));
  }
}

/** Finds standalone color literals in plain text, ignoring tokens inside identifiers. */
export function findColorLiterals(text: string): Array<{ literal: string; index: number }> {
  const found: Array<{ literal: string; index: number }> = [];
  COLOR_LITERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = COLOR_LITERAL_RE.exec(text);
    if (match === null) break;
    if (hasValidBoundary(text, match.index, match[0][0] === "#")) {
      found.push({ literal: match[0], index: match.index });
    }
  }
  return found;
}

/** Returns a CSS color for the swatch, or null when the literal is unusable. */
export function resolveSwatchColor(literal: string): string | null {
  if (literal[0] === "#") return literal;
  if (!SINGLE_LITERAL_RE.test(literal)) return null;
  const fn = FUNCTION_RE.exec(literal);
  if (!fn) return null;

  const name = fn[1].toLowerCase();
  const base = name.replace(/a$/, "");
  if (!CONVERTED_FUNCTIONS.has(base)) return literal;

  if (base === "cmyk" || base === "device-cmyk") {
    // Colordx only parses the CSS spelling; alias the short form.
    const converted = colordx(base === "cmyk" ? `device-cmyk(${fn[2]})` : literal);
    return converted.isValid() ? converted.toHex8() : null;
  }

  const parts = fn[2]
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return literal;

  const h = parseHue(parts[0]);
  const second = parseUnit(parts[1]);
  const third = parseUnit(parts[2]);
  const alpha = parts[3] === undefined ? 1 : parseUnit(parts[3]);
  if (h === null || second === null || third === null || alpha === null) return literal;

  const rgb =
    base === "okhsl"
      ? okhslToRgbChannels(h, second * 100, third * 100)
      : base === "okhsv"
        ? okhsvToRgbChannels(h, second * 100, third * 100)
        : hsvToRgbChannels(h, second * 100, third * 100);
  return formatRgb(rgb, alpha);
}

/** Hue in degrees, or turns for a bare value in 0..1. Accepts deg/°/turn/%. */
function parseHue(token: string): number | null {
  if (token.endsWith("deg")) return finiteOrNull(Number(token.slice(0, -3)));
  if (token.endsWith("°")) return finiteOrNull(Number(token.slice(0, -1)));
  if (token.endsWith("turn")) return finiteOrNull(Number(token.slice(0, -4)) * 360);
  if (token.endsWith("%")) return finiteOrNull(Number(token.slice(0, -1)) * 3.6);
  const n = Number(token);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) <= 1 ? n * 360 : n;
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/** Saturation/value/lightness in 0..1. Accepts percent or a 0..100 number. */
function parseUnit(token: string): number | null {
  if (token.endsWith("%")) {
    const n = Number(token.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(token);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function formatRgb([r, g, b]: [number, number, number], alpha: number): string {
  const toByte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const channels = `${toByte(r)} ${toByte(g)} ${toByte(b)}`;
  return alpha < 1 ? `rgb(${channels} / ${alpha})` : `rgb(${channels})`;
}
