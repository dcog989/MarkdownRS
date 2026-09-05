import { translate } from "$lib/i18n";
import { hashContent } from "./contentHash";

/**
 * Renders ```mermaid fenced code blocks in a preview container after the
 * rendered HTML has been injected into the DOM.
 *
 * Mermaid is a large dependency, so it is only fetched via a dynamic import
 * when at least one mermaid block is present. Rendered SVGs are cached by
 * source hash, so unchanged diagrams are not re-rendered on every preview
 * update.
 */

const MERMAID_SELECTOR = "pre > code.language-mermaid";
const MAX_CACHE_ENTRIES = 50;

type MermaidModule = typeof import("mermaid");

let mermaidPromise: Promise<MermaidModule> | null = null;
let initializedTheme: string | null = null;
let renderSeq = 0;

const svgCache = new Map<string, string>();

function loadMermaid(): Promise<MermaidModule> {
  mermaidPromise ??= import("mermaid");
  return mermaidPromise;
}

function detectTheme(): "dark" | "default" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}

async function getMermaid(): Promise<MermaidModule> {
  const mod = await loadMermaid();
  const theme = detectTheme();
  if (initializedTheme !== theme) {
    mod.default.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
    initializedTheme = theme;
  }
  return mod;
}

function createErrorNode(source: string, error: unknown): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "mermaid-container mermaid-error";

  const label = document.createElement("p");
  label.className = "mermaid-error-label";
  label.textContent = translate("preview.mermaidError");

  const detail = document.createElement("p");
  detail.className = "mermaid-error-detail";
  detail.textContent = error instanceof Error ? error.message : String(error);

  const code = document.createElement("pre");
  const codeContent = document.createElement("code");
  codeContent.textContent = source;

  code.append(codeContent);
  wrapper.append(label, detail, code);
  return wrapper;
}

function insertDiagram(pre: HTMLPreElement, svg: string, key: string): void {
  const wrapper = document.createElement("div");
  wrapper.className = "mermaid-container";
  wrapper.dataset.diagramKey = key;
  wrapper.innerHTML = svg;
  pre.replaceWith(wrapper);
}

/**
 * Finds mermaid fenced blocks in `container` and replaces them with rendered
 * SVG diagrams. No-op when the container holds no mermaid blocks. Detached
 * blocks (replaced by a newer preview render) are skipped.
 */
export async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(MERMAID_SELECTOR));
  if (blocks.length === 0) return;

  const mermaid = (await getMermaid()).default;

  for (const block of blocks) {
    const pre = block.closest("pre");
    if (!pre?.isConnected) continue;

    const source = block.textContent ?? "";
    const key = hashContent(source);
    const cached = svgCache.get(key);
    if (cached !== undefined) {
      insertDiagram(pre, cached, key);
      continue;
    }

    try {
      const id = `mermaid-${key}-${renderSeq++}`;
      const { svg } = await mermaid.render(id, source);
      if (svgCache.size >= MAX_CACHE_ENTRIES) svgCache.clear();
      svgCache.set(key, svg);
      if (!pre.isConnected) continue;
      insertDiagram(pre, svg, key);
    } catch (err) {
      if (!pre.isConnected) continue;
      pre.replaceWith(createErrorNode(source, err));
    }
  }
}

export function clearMermaidCache(): void {
  svgCache.clear();
}
