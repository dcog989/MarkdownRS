// Shared path helpers. Both `/` and `\` separators are handled so the same
// functions work for POSIX and Windows paths without per-call normalization.

/**
 * Return the parent directory of `path`. `/` and an empty path are returned
 * unchanged (the filesystem root has no parent).
 */
export function dirname(path: string): string {
  if (path === '') return path;
  const normalized = path.replaceAll('\\', '/');
  if (normalized === '/') return '/';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '/';
  return normalized.slice(0, idx);
}

/**
 * Return the final path segment of `path` (empty when the path ends in a
 * separator, e.g. `dirname('/a/')` is `''`).
 */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || '';
}
