import katex from "katex";
import "katex/dist/katex.min.css";
import { hashContent } from "./contentHash";

/**
 * Renders KaTeX to HTML via `renderToString` with an expression-hash cache.
 * KaTeX output is deterministic, so identical TeX input produces identical
 * HTML; caching avoids re-rendering unchanged expressions on every preview.
 */

const MAX_CACHE_ENTRIES = 1000;
const MATH_STYLE_ATTR = "data-math-style";

const BASE_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  strict: false,
};

const mathCache = new Map<string, string>();

function cacheKey(tex: string, displayMode: boolean): string {
  return `${displayMode ? "d" : "i"}:${hashContent(tex)}`;
}

function renderMathToString(tex: string, displayMode: boolean): string {
  const key = cacheKey(tex, displayMode);
  const cached = mathCache.get(key);
  if (cached !== undefined) return cached;

  const html = katex.renderToString(tex, { ...BASE_OPTIONS, displayMode });

  if (mathCache.size >= MAX_CACHE_ENTRIES) {
    mathCache.clear();
  }
  mathCache.set(key, html);
  return html;
}

/**
 * Replaces comrak math spans (`[data-math-style]`) in rendered HTML with
 * cached KaTeX HTML. Returns the input unchanged when no math is present.
 */
export function renderMathInHtml(html: string): string {
  if (!html.includes(MATH_STYLE_ATTR)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = doc.querySelectorAll(`[${MATH_STYLE_ATTR}]`);
  if (nodes.length === 0) return html;

  for (const node of nodes) {
    const displayMode = node.getAttribute(MATH_STYLE_ATTR) === "display";
    const tex = node.textContent ?? "";
    const html = renderMathToString(tex, displayMode);
    const target = node.tagName === "CODE" && node.parentElement?.tagName === "PRE" ? node.parentElement : node;
    target.insertAdjacentHTML("beforebegin", html);
    target.remove();
  }

  return doc.body.innerHTML;
}

export function clearMathCache(): void {
  mathCache.clear();
}
