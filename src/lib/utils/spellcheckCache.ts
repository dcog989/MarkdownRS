import type { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';

class TabSpellcheckCache {
  private tabCaches = new Map<
    string,
    {
      fingerprint: string;
      diagnostics: Diagnostic[];
      misspelledWords: Set<string>;
    }
  >();

  get(tabId: string, fingerprint: string) {
    const cached = this.tabCaches.get(tabId);
    if (cached && cached.fingerprint === fingerprint) {
      return cached;
    }
    return null;
  }

  set(tabId: string, fingerprint: string, diagnostics: Diagnostic[], misspelledWords: Set<string>) {
    this.tabCaches.set(tabId, {
      fingerprint,
      diagnostics,
      misspelledWords,
    });
  }

  invalidate(tabId: string) {
    this.tabCaches.delete(tabId);
  }

  invalidateAll() {
    this.tabCaches.clear();
  }
}

function docFingerprint(doc: Text): string {
  const len = doc.length;
  if (len === 0) return '0:';
  const mid = Math.floor(len / 2);
  const sampleLen = 32;
  const start = doc.sliceString(0, Math.min(sampleLen, len));
  const middle = doc.sliceString(Math.max(0, mid - sampleLen / 2), Math.min(len, mid + sampleLen / 2));
  const end = doc.sliceString(Math.max(0, len - sampleLen), len);
  return `${len}:${start}|${middle}|${end}`;
}

const tabCache = new TabSpellcheckCache();

export function invalidateSpellcheckCache(tabId?: string) {
  if (tabId) {
    tabCache.invalidate(tabId);
  } else {
    tabCache.invalidateAll();
  }
}

export { docFingerprint, TabSpellcheckCache, tabCache };
