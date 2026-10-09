import type { Line } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { type DecorationWalk, isVisibleInCodeBlock } from "./markdownDecorationCore";

/**
 * Color literals surfaced as an inline swatch in rendered mode. Matches the CSS
 * Color 4 function forms plus bare hex. Function parsing is delegated to the
 * browser for spaces the WebView supports; oklab/okhsl are converted here so the
 * swatch renders even where they are unsupported.
 */
const COLOR_LITERAL_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|okhsl|color)\([^()\n]*\)/gi;

const FUNCTION_RE = /^([a-z]+)\(([^()]*)\)$/i;

/** Ancestors whose text should never receive a swatch (links, code, raw HTML). */
const SKIP_ANCESTORS = new Set(["Link", "Image", "Autolink", "URL", "HTMLBlock", "HTMLTag", "Comment"]);

const OKLAB_A_B_PERCENT_SCALE = 0.4;

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

function isInSkippedConstruct(tree: DecorationWalk["tree"], pos: number): boolean {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (node) {
    if (SKIP_ANCESTORS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Appends a prefix swatch decoration for every color literal on the line. Skips
 * code, links, and raw HTML so swatches only decorate prose color values.
 */
export function collectColorSwatches(walk: DecorationWalk, line: Line): void {
  if (!walk.colorSwatches) return;
  if (isVisibleInCodeBlock(walk.tree, line.from)) return;

  for (const { literal, index } of findColorLiterals(line.text)) {
    const start = line.from + index;
    if (isVisibleInCodeBlock(walk.tree, start)) continue;
    if (isInSkippedConstruct(walk.tree, start)) continue;
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
  const fn = FUNCTION_RE.exec(literal);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  if (name === "oklab" || name === "okhsl") {
    return convertFunctionColor(name, fn[2]) ?? literal;
  }
  return literal;
}

function convertFunctionColor(name: string, args: string): string | null {
  const parts = args
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  if (name === "oklab") {
    const L = parseUnit(parts[0], 1);
    const a = parseUnit(parts[1], OKLAB_A_B_PERCENT_SCALE);
    const b = parseUnit(parts[2], OKLAB_A_B_PERCENT_SCALE);
    if (L === null || a === null || b === null) return null;
    return srgbToCss(oklabToSrgb(L, a, b));
  }
  const h = parseHue(parts[0]);
  const s = parseUnit(parts[1], 1);
  const l = parseUnit(parts[2], 1);
  if (h === null || s === null || l === null) return null;
  return srgbToCss(okhslToSrgb(h, s, l));
}

function parseUnit(token: string, percentScale: number): number | null {
  if (token.endsWith("%")) {
    const n = Number(token.slice(0, -1));
    return Number.isFinite(n) ? (n / 100) * percentScale : null;
  }
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

/** Accepts turns (0..1), `deg`/`°`, `turn`, or a percentage; bare values > 1 are degrees. */
function parseHue(token: string): number | null {
  if (token.endsWith("deg")) return finiteOrNull(Number(token.slice(0, -3)) / 360);
  if (token.endsWith("°")) return finiteOrNull(Number(token.slice(0, -1)) / 360);
  if (token.endsWith("turn")) return finiteOrNull(Number(token.slice(0, -4)));
  if (token.endsWith("%")) return finiteOrNull(Number(token.slice(0, -1)) / 100);
  const n = Number(token);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 1 ? n / 360 : n;
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

// --- Color space conversions (Björn Ottosson's Oklab/Okhsl reference) --------

const OKLAB_K1 = 0.206;
const OKLAB_K2 = 0.03;
const OKLAB_K3 = (1 + OKLAB_K1) / (1 + OKLAB_K2);

function toeInv(x: number): number {
  return (x * x + OKLAB_K1 * x) / (OKLAB_K3 * (x + OKLAB_K2));
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function okhslToSrgb(h: number, s: number, l: number): [number, number, number] {
  if (l >= 1) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];
  const a_ = Math.cos(2 * Math.PI * h);
  const b_ = Math.sin(2 * Math.PI * h);
  const L = toeInv(l);
  const [C_0, C_mid, C_max] = getCs(L, a_, b_);
  let C: number;
  if (s < 0.8) {
    const t = 1.25 * s;
    const k_1 = 0.8 * C_0;
    const k_2 = 1 - k_1 / C_mid;
    C = (t * k_1) / (1 - k_2 * t);
  } else {
    const t = 5 * (s - 0.8);
    const k_1 = (0.2 * C_mid * C_mid * 1.25 * 1.25) / C_0;
    const k_2 = 1 - k_1 / (C_max - C_mid);
    C = C_mid + (t * k_1) / (1 - k_2 * t);
  }
  return oklabToSrgb(L, C * a_, C * b_);
}

function getCs(L: number, a_: number, b_: number): [number, number, number] {
  const cusp = findCusp(a_, b_);
  const C_max = findGamutIntersection(a_, b_, L, 1, L, cusp);
  const stMax = toSt(cusp);
  const S_mid =
    0.11516993 +
    1 /
      (7.4477897 +
        4.1590124 * b_ +
        a_ *
          (-2.19557347 +
            1.75198401 * b_ +
            a_ * (-2.13704948 - 10.02301043 * b_ + a_ * (-4.24894561 + 5.38770819 * b_ + 4.69891013 * a_))));
  const T_mid =
    0.11239642 +
    1 /
      (1.6132032 -
        0.68124379 * b_ +
        a_ *
          (0.40370612 +
            0.90148123 * b_ +
            a_ * (-0.27087943 + 0.6122399 * b_ + a_ * (0.00299215 - 0.45399568 * b_ - 0.14661872 * a_))));
  const k = C_max / Math.min(L * stMax[0], (1 - L) * stMax[1]);
  const C_a = L * S_mid;
  const C_b = (1 - L) * T_mid;
  const C_mid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / C_a ** 4 + 1 / C_b ** 4)));
  const C0_a = L * 0.4;
  const C0_b = (1 - L) * 0.8;
  const C_0 = Math.sqrt(1 / (1 / C0_a ** 2 + 1 / C0_b ** 2));
  return [C_0, C_mid, C_max];
}

function toSt(cusp: [number, number]): [number, number] {
  return [cusp[1] / cusp[0], cusp[1] / (1 - cusp[0])];
}

function computeMaxSaturation(a: number, b: number): number {
  let k0: number;
  let k1: number;
  let k2: number;
  let k3: number;
  let k4: number;
  let wl: number;
  let wm: number;
  let ws: number;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = 1.19086277;
    k1 = 1.76576728;
    k2 = 0.59662641;
    k3 = 0.75515197;
    k4 = 0.56771245;
    wl = 4.0767416621;
    wm = -3.3077115913;
    ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = 0.73956515;
    k1 = -0.45954404;
    k2 = 0.08285427;
    k3 = 0.1254107;
    k4 = 0.14503204;
    wl = -1.2684380046;
    wm = 2.6097574011;
    ws = -0.3413193965;
  } else {
    k0 = 1.35733652;
    k1 = -0.00915799;
    k2 = -1.1513021;
    k3 = -0.50559606;
    k4 = 0.00692167;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = 1.707614701;
  }
  const S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
  const k_l = 0.3963377774 * a + 0.2158037573 * b;
  const k_m = -0.1055613458 * a - 0.0638541728 * b;
  const k_s = -0.0894841775 * a - 1.291485548 * b;
  const l_ = 1 + S * k_l;
  const m_ = 1 + S * k_m;
  const s_ = 1 + S * k_s;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const l_dS = 3 * k_l * l_ * l_;
  const m_dS = 3 * k_m * m_ * m_;
  const s_dS = 3 * k_s * s_ * s_;
  const l_dS2 = 6 * k_l * k_l * l_;
  const m_dS2 = 6 * k_m * k_m * m_;
  const s_dS2 = 6 * k_s * k_s * s_;
  const f = wl * l + wm * m + ws * s;
  const f1 = wl * l_dS + wm * m_dS + ws * s_dS;
  const f2 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;
  return S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
}

function findCusp(a: number, b: number): [number, number] {
  const S_cusp = computeMaxSaturation(a, b);
  const rgbAtMax = oklabToLinearSrgb(1, S_cusp * a, S_cusp * b);
  const L_cusp = Math.cbrt(1 / Math.max(rgbAtMax[0], rgbAtMax[1], rgbAtMax[2]));
  return [L_cusp, L_cusp * S_cusp];
}

function findGamutIntersection(
  a: number,
  b: number,
  L1: number,
  C1: number,
  L0: number,
  cusp: [number, number],
): number {
  let t: number;
  if ((L1 - L0) * cusp[1] - (cusp[0] - L0) * C1 <= 0) {
    t = (cusp[1] * L0) / (C1 * cusp[0] + cusp[1] * (L0 - L1));
  } else {
    t = (cusp[1] * (L0 - 1)) / (C1 * (cusp[0] - 1) + cusp[1] * (L0 - L1));
    const dL = L1 - L0;
    const dC = C1;
    const k_l = 0.3963377774 * a + 0.2158037573 * b;
    const k_m = -0.1055613458 * a - 0.0638541728 * b;
    const k_s = -0.0894841775 * a - 1.291485548 * b;
    const l_dt = dL + dC * k_l;
    const m_dt = dL + dC * k_m;
    const s_dt = dL + dC * k_s;
    const L = L0 * (1 - t) + t * L1;
    const C = t * C1;
    const l_ = L + C * k_l;
    const m_ = L + C * k_m;
    const s_ = L + C * k_s;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    const ldt = 3 * l_dt * l_ * l_;
    const mdt = 3 * m_dt * m_ * m_;
    const sdt = 3 * s_dt * s_ * s_;
    const ldt2 = 6 * l_dt * l_dt * l_;
    const mdt2 = 6 * m_dt * m_dt * m_;
    const sdt2 = 6 * s_dt * s_dt * s_;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
    const r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
    const r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;
    const u_r = r1 / (r1 * r1 - 0.5 * r * r2);
    const t_r = -r * u_r;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
    const g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
    const g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;
    const u_g = g1 / (g1 * g1 - 0.5 * g * g2);
    const t_g = -g * u_g;
    const b_ = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s - 1;
    const b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.707614701 * sdt;
    const b2 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.707614701 * sdt2;
    const u_b = b1 / (b1 * b1 - 0.5 * b_ * b2);
    const t_b = -b_ * u_b;
    t += Math.min(u_r >= 0 ? t_r : 1e5, Math.min(u_g >= 0 ? t_g : 1e5, u_b >= 0 ? t_b : 1e5));
  }
  return t;
}

function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const linear = oklabToLinearSrgb(L, a, b);
  return [linearToSrgb(linear[0]), linearToSrgb(linear[1]), linearToSrgb(linear[2])];
}

function srgbToCss([r, g, b]: [number, number, number]): string {
  const toByte = (v: number) => Math.round(v * 255);
  return `rgb(${toByte(r)} ${toByte(g)} ${toByte(b)})`;
}
