import "katex/dist/katex.min.css";
import { hashContent } from "./contentHash";

/**
 * Renders KaTeX to HTML via `renderToString` with an expression-hash cache.
 * KaTeX output is deterministic, so identical TeX input produces identical
 * HTML; caching avoids re-rendering unchanged expressions on every preview.
 *
 * KaTeX is a large dependency, so its JavaScript is only fetched via a dynamic
 * import when at least one math span is present. The stylesheet stays static so
 * math is never briefly painted unstyled.
 */

const MAX_CACHE_ENTRIES = 1000;
const MATH_STYLE_ATTR = "data-math-style";

type KatexModule = typeof import("katex");
type Katex = KatexModule["default"];
type KatexOptions = NonNullable<Parameters<Katex["renderToString"]>[1]>;

const BASE_OPTIONS: KatexOptions = {
  throwOnError: false,
  strict: false,
};

const mathCache = new Map<string, string>();

let katexPromise: Promise<Katex> | null = null;

function loadKatex(): Promise<Katex> {
  katexPromise ??= import("katex").then((mod) => mod.default);
  return katexPromise;
}

function cacheKey(tex: string, displayMode: boolean): string {
  return `${displayMode ? "d" : "i"}:${hashContent(tex)}`;
}

function renderMathToString(katex: Katex, tex: string, displayMode: boolean): string {
  const key = cacheKey(tex, displayMode);
  const cached = mathCache.get(key);
  if (cached !== undefined) return cached;

  const rendered = katex.renderToString(tex, { ...BASE_OPTIONS, displayMode });

  if (mathCache.size >= MAX_CACHE_ENTRIES) {
    mathCache.clear();
  }
  mathCache.set(key, rendered);
  return rendered;
}

/**
 * Replaces comrak math spans (`[data-math-style]`) in rendered HTML with
 * cached KaTeX HTML. Returns the input unchanged when no math is present.
 */
export async function renderMathInHtml(html: string): Promise<string> {
  if (!html.includes(MATH_STYLE_ATTR)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = doc.querySelectorAll(`[${MATH_STYLE_ATTR}]`);
  if (nodes.length === 0) return html;

  const katex = await loadKatex();

  for (const node of nodes) {
    const displayMode = node.getAttribute(MATH_STYLE_ATTR) === "display";
    const tex = node.textContent ?? "";
    const rendered = renderMathToString(katex, tex, displayMode);
    const target = node.tagName === "CODE" && node.parentElement?.tagName === "PRE" ? node.parentElement : node;
    target.insertAdjacentHTML("beforebegin", rendered);
    target.remove();
  }

  return doc.body.innerHTML;
}

export function clearMathCache(): void {
  mathCache.clear();
}
