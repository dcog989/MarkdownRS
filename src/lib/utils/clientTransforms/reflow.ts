import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { SyntaxNode } from "@lezer/common";
import { frontmatterExtension } from "$lib/utils/frontmatterExtension";

/**
 * Markdown parser configured like the editor's own, so structure detection
 * (frontmatter, fences, lists, quotes, tables, HTML) matches what the user sees.
 */
const markdownParser = markdown({
  base: markdownLanguage,
  extensions: [frontmatterExtension],
}).language.parser;

/**
 * Structural inline nodes that carry no paragraph content. Skipped while
 * collecting tokens, e.g. the ">" on a blockquote continuation line.
 */
const STRUCTURAL_NODE = new Set([
  "QuoteMark",
  "ListMark",
  "HeaderMark",
  "TaskMarker",
  "CodeMark",
  "CodeInfo",
  "CodeText",
  "LinkMark",
  "URL",
  "EmphasisMark",
]);

function isStructural(name: string): boolean {
  return STRUCTURAL_NODE.has(name);
}

/**
 * Prefix used on continuation lines. Blockquote ">" markers are repeated;
 * every other character (list markers, task markers, indentation) becomes a
 * space, preserving the content column exactly.
 */
function continuationPrefix(firstPrefix: string): string {
  let result = "";
  for (let i = 0; i < firstPrefix.length; i++) {
    const ch = firstPrefix[i];
    if (ch === ">") result += ">";
    else if (i > 0 && firstPrefix[i - 1] === ">") result += " ";
    else result += " ";
  }
  return result;
}

function wrapTokens(tokens: string[], width: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (current && candidate.length > width) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function addWords(text: string, tokens: string[]): void {
  for (const word of text.split(/\s+/)) {
    if (word) tokens.push(word);
  }
}

/**
 * Collects reflowable tokens from a paragraph-like node, starting at `from`
 * (the content start, after any task marker). Plain text is implicit in the
 * gaps between the node's children, so those gaps are split into words; inline
 * markup nodes (emphasis, code, links, images, ...) become atomic chunks that
 * are never split. Returns null when the paragraph must be left untouched
 * (contains a hard line break).
 */
function collectTokens(text: string, node: SyntaxNode, from: number): string[] | null {
  const tokens: string[] = [];
  let pos = from;
  let child = node.firstChild;

  while (child) {
    if (child.to > from) {
      addWords(text.slice(pos, child.from), tokens);
      const name = child.type.name;
      if (name === "HardBreak") return null;
      if (!isStructural(name)) {
        const chunk = text.slice(child.from, child.to).trim();
        if (chunk) tokens.push(chunk);
      }
      pos = child.to;
    }
    child = child.nextSibling;
  }
  addWords(text.slice(pos, node.to), tokens);

  return tokens;
}

/**
 * Content start of a paragraph-like node: the position right after its list
 * marker (task items wrap their marker inside a `Task` node), else node start.
 */
function contentStartOf(text: string, node: SyntaxNode): number {
  if (node.type.name === "Task") {
    let child = node.firstChild;
    while (child && child.type.name !== "TaskMarker") child = child.nextSibling;
    if (child) {
      let pos = child.to;
      while (pos < node.to && /\s/.test(text[pos])) pos++;
      return pos;
    }
  }
  return node.from;
}

/**
 * Hard-wraps markdown at `column` by reflowing every paragraph — including
 * paragraphs inside list items, task items, blockquotes, and nested
 * combinations — while preserving their structural prefix on each generated
 * line. Inline markup is kept atomic (never split internally). Fenced/indented
 * code, headings, tables, HTML blocks, horizontal rules, and frontmatter are
 * never touched. Paragraphs with hard line breaks are left alone.
 */
export function reflowParagraphs(text: string, column: number): string {
  if (!text.trim()) return text;
  const target = Math.max(1, Math.floor(column));

  const tree = markdownParser.parse(text);
  const changes: { from: number; to: number; insert: string }[] = [];
  const cursor = tree.cursor();

  do {
    const name = cursor.type.name;
    if (name !== "Paragraph" && name !== "Task") continue;
    const node = cursor.node;

    const replaceFrom = contentStartOf(text, node);
    const replaceTo = node.to;
    if (replaceFrom >= replaceTo) continue;

    const lineStart = text.lastIndexOf("\n", replaceFrom - 1) + 1;
    const firstPrefix = text.slice(lineStart, replaceFrom);
    const contentColumn = firstPrefix.length;
    if (contentColumn >= target) continue;

    const content = text.slice(replaceFrom, replaceTo);
    if (!content.includes("\n") && content.length + contentColumn <= target) continue;

    const tokens = collectTokens(text, node, replaceFrom);
    if (!tokens || tokens.length === 0) continue;

    const prefix = continuationPrefix(firstPrefix);
    const wrapped = wrapTokens(tokens, target - contentColumn);
    const insert = wrapped.map((line, i) => (i === 0 ? line : prefix + line)).join("\n");
    if (insert === content) continue;

    changes.push({ from: replaceFrom, to: replaceTo, insert });
  } while (cursor.next());

  if (changes.length === 0) return text;

  let result = text;
  for (const change of changes.sort((a, b) => b.from - a.from)) {
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  return result;
}
