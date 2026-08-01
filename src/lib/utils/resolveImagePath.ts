import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Normalizes a relative path against a base directory, collapsing '.' and '..'
 * segments. The result is always an absolute path with forward slashes.
 */
function joinAndNormalize(baseDir: string, relativePath: string): string {
  const cleanBase = baseDir.replace(/\\/g, '/');
  const cleanRelative = relativePath.replace(/\\/g, '/');
  const parts = [...cleanBase.split('/'), ...cleanRelative.split('/')].filter((p) => p && p !== '.');

  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  const result = resolved.join('/');
  return /^[a-zA-Z]:/.test(result) ? result : `/${result}`;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Resolves an image `src` attribute from markdown to a value usable in an
 * `<img>` tag. Remote/data URIs pass through unchanged, `static/` references
 * map to the web root, and local paths are resolved against `baseDir` and
 * converted to a Tauri asset URL.
 */
export function resolveImageSrc(src: string, baseDir: string): string {
  if (!src || /^(https?|data|blob|asset|tauri):/i.test(src)) return src;

  const clean = src.replace(/\\/g, '/');

  if (clean.includes('../static/') || clean.includes('./static/')) {
    return `/${clean.split('/').pop()}`;
  }

  const isAbsolute = clean.startsWith('/') || /^[a-zA-Z]:/.test(clean);
  if (!isAbsolute && !baseDir) return src;

  const resolved = isAbsolute ? joinAndNormalize('', clean) : joinAndNormalize(baseDir, clean);
  return isTauriRuntime() ? convertFileSrc(resolved) : resolved;
}
