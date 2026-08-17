export interface FuzzyMatchResult {
  score: number;
  positions: number[];
}

const BOUNDARY_CHARS = new Set(['/', '.', '_', '-', ' ', '\\', '[', ']', '(', ')', '#', '@']);

function isStrongBoundary(index: number, candidate: string): boolean {
  if (index === 0) return true;
  const prev = candidate[index - 1];
  if (BOUNDARY_CHARS.has(prev)) return true;
  // camelCase transition (fooBar -> "B" follows a lowercase letter).
  return /[a-z]/.test(prev) && /[A-Z]/.test(candidate[index]);
}

/**
 * Fuzzy subsequence match for search-as-you-type paths. Returns null when the
 * query characters cannot be found in order (case-insensitive), otherwise a
 * score where higher is better. Matches that fall on segment boundaries, in
 * the basename, consecutively, or that match the original casing score higher;
 * matches buried deep in a long path score lower.
 */
export function fuzzyMatch(query: string, candidate: string): FuzzyMatchResult | null {
  if (!query) return { score: 0, positions: [] };

  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  const basenameStart = candidate.lastIndexOf('/') + 1;

  let score = 0;
  const positions: number[] = [];
  let searchFrom = 0;
  let prevMatch = -1;

  for (let i = 0; i < q.length; i++) {
    const idx = c.indexOf(q[i], searchFrom);
    if (idx === -1) return null;
    positions.push(idx);

    let s = 1;
    if (isStrongBoundary(idx, candidate)) s += 12;
    if (idx >= basenameStart) s += 6;
    if (idx === prevMatch + 1) s += 10;
    if (candidate[idx] === query[i]) s += 2;
    s -= Math.floor(idx / 32);
    score += s;

    prevMatch = idx;
    searchFrom = idx + 1;
  }

  // Prefer candidates that are dense in the query: shorter candidates with
  // matches close together outrank longer paths with scattered hits.
  score -= Math.max(0, candidate.length - query.length);
  return { score, positions };
}
