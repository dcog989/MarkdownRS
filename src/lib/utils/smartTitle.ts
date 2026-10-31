import { getFilename } from "$lib/utils/fileValidation";

/**
 * The non-content-derived fallback title for a tab: the file name for
 * file-backed tabs, or the original/untitled name otherwise. Used whenever
 * content-naming is disabled so tabs never keep a stale first-line title.
 */
export function getBaseTitle(tab: { path?: string | null; title: string; originalTitle?: string }): string {
  if (tab.path) {
    const name = getFilename(tab.path);
    if (name) return name;
  }
  return tab.originalTitle || tab.title;
}

const FRONTMATTER_DELIMITERS = new Set(["---", "+++", ";;;"]);

// A tab label only needs the first non-empty line after frontmatter, so there
// is no reason to scan a whole large document on every debounced edit.
// shortcut: content past 16 KB is ignored for titles; raise it if a document
// can carry more than 16 KB of frontmatter or blank lines before its title.
const TITLE_SCAN_LIMIT = 16_384;

/**
 * Drops a leading frontmatter block so its keys (`title: ...`) are not read as
 * the document title.
 *
 * shortcut: `{...}`-delimited JSON is not skipped; brace matching is not worth
 * it for a tab label, add it if JSON frontmatter ever matters here.
 */
function stripFrontmatter(content: string): string {
  const lines = content.split("\n");
  const opener = lines[0]?.trimEnd();
  if (!opener || !FRONTMATTER_DELIMITERS.has(opener)) return content;
  const closing = lines.findIndex((line, i) => i > 0 && line.trimEnd() === opener);
  return closing === -1 ? content : lines.slice(closing + 1).join("\n");
}

export function extractSmartTitle(content: string): string | null {
  const body = stripFrontmatter(content.slice(0, TITLE_SCAN_LIMIT));
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;

  const firstLine = body.split("\n").find((l) => {
    const t = l.trim();
    return t.length > 0 && /[a-zA-Z0-9]/.test(t.replace(/^#+\s*/, ""));
  });

  if (!firstLine) return null;

  const title = firstLine
    .replace(/^#+\s*/, "")
    .replace(/^(?:<[^>]+>\s*)+/, "")
    .trim();
  if (title.length === 0) return null;

  return title;
}
