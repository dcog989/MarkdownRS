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
