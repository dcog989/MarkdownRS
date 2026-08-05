import { describe, expect, it } from 'vitest';
import { hashContent, isDirty, updateSavedHash } from './contentHash';

describe('hashContent', () => {
  it('returns a stable hash for identical input', () => {
    expect(hashContent('hello world')).toBe(hashContent('hello world'));
  });

  it('returns a different hash for different input', () => {
    expect(hashContent('hello world')).not.toBe(hashContent('hello worlD'));
  });

  it('handles empty and unicode strings', () => {
    expect(hashContent('')).toBe(hashContent(''));
    expect(hashContent('→ emoji 🎉')).toBe(hashContent('→ emoji 🎉'));
  });
});

describe('isDirty', () => {
  it('reports clean when hashes match', () => {
    expect(isDirty('same', hashContent('same'))).toBe(false);
  });

  it('reports dirty when hashes differ', () => {
    expect(isDirty('different', hashContent('same'))).toBe(true);
  });
});

describe('updateSavedHash', () => {
  it('syncs the tab hash to the current content', () => {
    const tab = { lastSavedHash: 'old', content: 'new content' };
    updateSavedHash(tab);
    expect(tab.lastSavedHash).toBe(hashContent('new content'));
  });
});
