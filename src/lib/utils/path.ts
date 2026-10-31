// Shared path helpers. Both `/` and `\` separators are handled so the same
// functions work for POSIX and Windows paths without per-call normalization.

/**
 * Convert a native filesystem path (`\` on Windows) to the `/` form the store
 * and tab paths use, dropping NUL bytes the OS cannot represent.
 */
export function normalizePath(path: string): string {
  return path.replace(/\0/g, "").replaceAll("\\", "/");
}

/**
 * Return the parent directory of `path`. `/` and an empty path are returned
 * unchanged (the filesystem root has no parent).
 */
export function dirname(path: string): string {
  if (path === "") return path;
  const normalized = normalizePath(path);
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized) || /^\/\/[^/]+\/[^/]+$/.test(normalized)) {
    return normalized;
  }
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return normalized;
  if (idx === 0) return "/";
  const parent = normalized.slice(0, idx);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

/**
 * Return the final path segment of `path` (empty when the path ends in a
 * separator, e.g. `basename('/a/')` is `''`).
 */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || "";
}
