import { CONFIG } from '$lib/utils/config';
import { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { countWords, fastCountWords } from '$lib/utils/textMetrics';
import { editorStore } from './editorStoreCore.svelte';
import type { TabTransientState } from './editorTypes';

// eslint-disable-next-line svelte/prefer-svelte-reactivity
const historyStateCache = new Map<string, unknown>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const lineChangeTrackerCache = new Map<string, LineChangeTracker>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const transientStateCache = new Map<string, TabTransientState>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const wordCountDebounceMap = new Map<string, number>();

export function pickWordCountStrategy(sizeBytes: number): 'accurate' | 'fast' {
  return sizeBytes < CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES ? 'accurate' : 'fast';
}

export function computeWordCount(content: string, sizeBytes: number): number {
  return pickWordCountStrategy(sizeBytes) === 'accurate' ? countWords(content) : fastCountWords(content);
}

export function defaultTransientState(sizeBytes: number): TabTransientState {
  return {
    scrollPercentage: 0,
    scrollTop: 0,
    topLine: 1,
    contentChanged: false,
    isPersisted: false,
    wordCountStrategy: pickWordCountStrategy(sizeBytes),
    fileCheckPerformed: false,
    forceFullFeatures: false,
  };
}

export function getLineChangeTracker(id: string): LineChangeTracker {
  let tracker = lineChangeTrackerCache.get(id);
  if (!tracker) {
    tracker = new LineChangeTracker();
    lineChangeTrackerCache.set(id, tracker);
  }
  return tracker;
}

export function setLineChangeTracker(id: string, tracker: LineChangeTracker): void {
  lineChangeTrackerCache.set(id, tracker);
}

export function initTransientState(id: string, overrides?: Partial<TabTransientState>, sizeBytes: number = 0): void {
  transientStateCache.set(id, { ...defaultTransientState(sizeBytes), ...overrides });
}

export function getTransientState(id: string): TabTransientState | undefined {
  return transientStateCache.get(id);
}

export function updateTransientState(id: string, updates: Partial<TabTransientState>): void {
  const existing = transientStateCache.get(id);
  if (existing) Object.assign(existing, updates);
}

export function updateHistoryState(id: string, state: unknown) {
  historyStateCache.set(id, state);
}

export function getHistoryState(id: string): unknown | undefined {
  return historyStateCache.get(id);
}

export function clearTabCaches(id: string) {
  historyStateCache.delete(id);
  transientStateCache.delete(id);
  lineChangeTrackerCache.delete(id);
}

export function initTabCaches(id: string, sizeBytes: number) {
  lineChangeTrackerCache.set(id, new LineChangeTracker());
  transientStateCache.set(id, {
    ...defaultTransientState(sizeBytes),
    contentChanged: true,
  });
}

export function scheduleWordCountUpdate(tabId: string, content: string, sizeBytes: number) {
  const existing = wordCountDebounceMap.get(tabId);
  if (existing) clearTimeout(existing);

  const timeout = window.setTimeout(() => {
    const index = editorStore.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) {
      wordCountDebounceMap.delete(tabId);
      return;
    }

    const tab = editorStore.tabs[index];
    const ts = transientStateCache.get(tabId);
    const strategy = ts?.wordCountStrategy ?? pickWordCountStrategy(sizeBytes);
    if (ts && !ts.wordCountStrategy) ts.wordCountStrategy = strategy;

    const wordCount = computeWordCount(content, sizeBytes);

    editorStore.tabs[index] = {
      ...tab,
      wordCount,
      wordCountPending: false,
    };

    wordCountDebounceMap.delete(tabId);
  }, CONFIG.PERFORMANCE.WORD_COUNT_DEBOUNCE_MS);

  wordCountDebounceMap.set(tabId, timeout);
}
