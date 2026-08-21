import { getFilename } from '$lib/utils/fileValidation';

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

export function extractSmartTitle(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;

  const firstLine = content.split('\n').find((l) => {
    const t = l.trim();
    return t.length > 0 && /[a-zA-Z0-9]/.test(t.replace(/^#+\s*/, ''));
  });

  if (!firstLine) return null;

  const title = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^(?:<[^>]+>\s*)+/, '')
    .trim();
  if (title.length === 0) return null;

  return title;
}
