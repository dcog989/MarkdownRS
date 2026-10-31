/**
 * Boolean ordered-subsequence check (case-insensitive). Zero allocations,
 * intended for hot paths that only care whether a query matches (e.g. the
 * file tree filter) rather than how well it matches.
 */
export function fuzzyMatches(query: string, candidate: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  let searchFrom = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = c.indexOf(q[i], searchFrom);
    if (idx === -1) return false;
    searchFrom = idx + 1;
  }
  return true;
}
