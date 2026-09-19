import type { Text } from "@codemirror/state";
import { type Highlighter, type Tag, tags as t } from "@lezer/highlight";

const LINK_RE = /\[.*?\]\(.*?\)|\[.*?\]\[.*?\]|\[.*?\]\[\s*\]|^\s*\[[^\]]+\]:\s*\S|https?:\/\/\S+/;

const calloutMarkerRe = /^\s*>\s*\[!(note|tip|important|warning|caution)\]/i;
const quoteLineRe = /^\s*>/;
const fenceRe = /^\s*(?:```|~~~)/;

export function computeCalloutTypes(doc: Text): (string | null)[] {
  const types: (string | null)[] = new Array(doc.lines).fill(null);
  let current: string | null = null;
  let inFence = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i).text;
    if (fenceRe.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = calloutMarkerRe.exec(line);
    if (m) {
      current = m[1].toLowerCase();
      types[i - 1] = current;
    } else if (current && quoteLineRe.test(line)) {
      types[i - 1] = current;
    } else {
      current = null;
    }
  }
  return types;
}

export const minimapHighlighter: Highlighter = {
  style(tags: readonly Tag[]) {
    const has = (target: Tag) => tags.some((tag) => tag.set.includes(target));
    if (has(t.heading)) return "heading";
    if (has(t.monospace)) return "code";
    if (has(t.link) || has(t.url)) return "link";
    if (has(t.strong)) return "strong";
    if (has(t.emphasis)) return "emphasis";
    if (has(t.strikethrough)) return "strike";
    if (has(t.quote)) return "quote";
    if (has(t.list)) return "list";
    return "";
  },
};

export const codeBlockHighlighter: Highlighter = {
  style(tags: readonly Tag[]) {
    if (tags.length === 0) return "";
    const has = (target: Tag) => tags.some((tag) => tag.set.includes(target));
    if (
      has(t.heading) ||
      has(t.monospace) ||
      has(t.link) ||
      has(t.url) ||
      has(t.strong) ||
      has(t.emphasis) ||
      has(t.strikethrough) ||
      has(t.quote) ||
      has(t.list)
    )
      return "";
    return "code";
  },
  scope: (type) => type.name !== "Document",
};

const KIND_PRIORITY: Record<string, number> = {
  link: 6,
  strong: 5,
  emphasis: 4,
  code: 3,
  heading: 3,
  quote: 2,
  list: 1,
};

export function classesToKind(classes: string): string {
  const parts = classes.split(" ");
  if (parts[0] === "code") return "code";
  let best = "";
  let bestPriority = -1;
  for (const p of parts) {
    const priority = KIND_PRIORITY[p];
    if (priority !== undefined && priority > bestPriority) {
      bestPriority = priority;
      best = p;
    }
  }
  return best;
}

export function getLineKind(
  line: string,
  inCodeBlock: boolean,
): { kind: "heading" | "code" | "list" | "link" | "quote" | "empty" | "text"; inCodeBlock: boolean } {
  if (line.trim() === "") return { kind: "empty", inCodeBlock };

  if (/^```/.test(line)) {
    const newState = !inCodeBlock;
    return { kind: "code", inCodeBlock: newState };
  }

  if (inCodeBlock) return { kind: "code", inCodeBlock };

  if (/^#{1,6}\s/.test(line)) return { kind: "heading", inCodeBlock: false };
  if (LINK_RE.test(line)) return { kind: "link", inCodeBlock: false };
  if (/^[\s]*[-*+]\s/.test(line)) return { kind: "list", inCodeBlock: false };
  if (/^[\s]*\d+[.)]\s/.test(line)) return { kind: "list", inCodeBlock: false };
  if (/^\s*>\s/.test(line)) return { kind: "quote", inCodeBlock: false };
  return { kind: "text", inCodeBlock: false };
}

const KIND_WEIGHT: Record<string, number> = {
  heading: 6,
  link: 4,
  code: 3,
  list: 2,
  quote: 2,
  text: 0.3,
  "callout-note": 10,
  "callout-tip": 10,
  "callout-important": 10,
  "callout-warning": 10,
  "callout-caution": 10,
};

export function pickBarKind(counts: Record<string, number>): string {
  let best = "empty";
  let bestScore = 0;
  for (const [kind, count] of Object.entries(counts)) {
    if (kind === "empty") continue;
    const score = count * (KIND_WEIGHT[kind] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  }
  return best;
}
