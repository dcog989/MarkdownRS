import type { HLJSApi } from "highlight.js";
import { hashContent } from "./contentHash";

/**
 * Applies highlight.js token highlighting to fenced code blocks in a preview
 * container after the rendered HTML has been injected into the DOM.
 *
 * highlight.js is a large dependency, so it is only fetched via a dynamic
 * import when at least one highlightable code block is present. Highlighted
 * output is cached by (language, content hash), so unchanged blocks are not
 * re-highlighted on every preview update.
 */

const CODE_SELECTOR = 'pre > code[class*="language-"]';
const SKIP_LANGUAGES = new Set(["mermaid", "math", "plaintext", "text"]);
const MAX_CACHE_ENTRIES = 100;

type HighlightModule = typeof import("highlight.js");

let hljsPromise: Promise<HighlightModule> | null = null;

const highlightCache = new Map<string, string>();

function loadHljs(): Promise<HighlightModule> {
  hljsPromise ??= import("highlight.js");
  return hljsPromise;
}

function getLanguage(hljs: HLJSApi, className: string): string | null {
  const match = /(?:^|\s)language-([\w+-]+)(?:\s|$)/.exec(className);
  const language = match?.[1] ?? "plaintext";
  if (SKIP_LANGUAGES.has(language)) return null;
  return hljs.getLanguage(language) ? language : null;
}

/**
 * Finds highlightable fenced blocks in `container` and replaces their contents
 * with token-highlighted HTML. No-op when the container holds no code blocks.
 * Detached blocks (replaced by a newer preview render) are skipped.
 */
export async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(CODE_SELECTOR));
  if (blocks.length === 0) return;

  const hljs = (await loadHljs()).default;

  for (const code of blocks) {
    if (!code.isConnected) continue;

    const language = getLanguage(hljs, code.className);
    if (language === null) continue;

    const source = code.textContent ?? "";
    if (!source.trim()) continue;

    const key = `${language}\u0000${hashContent(source)}`;
    let highlighted = highlightCache.get(key);
    if (highlighted === undefined) {
      const result = hljs.highlight(source, { language, ignoreIllegals: true });
      if (highlightCache.size >= MAX_CACHE_ENTRIES) highlightCache.clear();
      highlighted = result.value;
      highlightCache.set(key, highlighted);
    }
    code.classList.add("hljs");
    code.innerHTML = highlighted;
  }
}

export function clearHighlightCache(): void {
  highlightCache.clear();
}
