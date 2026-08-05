/**
 * Simple non-cryptographic hash function for content comparison
 * Uses FNV-1a algorithm for fast string hashing
 */
export function hashContent(content: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime (16777619)
  }
  return (hash >>> 0).toString(16);
}

/**
 * Quick content comparison using hash
 * Returns true if content has changed (dirty)
 */
export function isDirty(content: string, savedHash: string): boolean {
  return hashContent(content) !== savedHash;
}

export function updateSavedHash(tab: { lastSavedHash: string; content: string }): void {
  tab.lastSavedHash = hashContent(tab.content);
}
