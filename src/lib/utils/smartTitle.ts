const SMART_TITLE_MAX_LENGTH = 25;

export function extractSmartTitle(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;

  const firstLine = content.split('\n').find((l) => {
    const t = l.trim();
    return t.length > 0 && /[a-zA-Z0-9]/.test(t.replace(/^#+\s*/, ''));
  });

  if (!firstLine) return null;

  let title = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^(?:<[^>]+>\s*)+/, '')
    .trim();
  if (title.length === 0) return null;

  if (title.length > SMART_TITLE_MAX_LENGTH) {
    title = `${title.substring(0, SMART_TITLE_MAX_LENGTH).trim()}...`;
  }

  return title;
}
