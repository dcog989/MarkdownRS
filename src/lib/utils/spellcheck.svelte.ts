/**
 * Spellcheck State Management
 *
 * This file uses Svelte 5 runes for all spellcheck-related state.
 * All properties are reactive and trigger UI updates when changed.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { callBackend } from './backend';
import { logger } from './logger';

const MAX_SUGGESTION_CACHE_SIZE = 200;
const MAX_VALID_CACHE_SIZE = 5000;

// Emitted by the backend when spellcheck initialization finishes. Payload is
// the terminal status string: "ready" or "failed".
const SPELLCHECK_STATUS_EVENT = 'spellcheck-status';
// Safety net in case no event ever arrives (backend panic/IPC failure).
const INIT_COMPLETION_FALLBACK_MS = 60_000;

// The linter stores possessive forms ("word's") under their base ("word") in
// both validCache and misspelledCache, so lookups must strip the suffix too.
function stripPossessiveSuffix(word: string): string {
  const lower = word.toLowerCase();
  return lower.endsWith("'s") ? lower.slice(0, -2) : lower;
}

export class SpellcheckManager {
  dictionaryLoaded = $state(false);
  misspelledCache = $state(new SvelteSet<string>());
  customDictionary = $state(new SvelteSet<string>());
  suggestionCache = $state(new SvelteMap<string, string[]>());
  validCache = new Set<string>();
  linterFailedNotified = false;

  private initPromise: Promise<void> | null = null;
  private pendingFetches = new Set<string>();

  async loadCustomDictionary(): Promise<void> {
    const words = await callBackend('load_user_dictionary', {}, 'Dictionary:Add', undefined, {
      ignore: true,
    });
    this.customDictionary = new SvelteSet((words || []).map((w) => w.toLowerCase()));
  }

  async init(force = false): Promise<void> {
    if (this.initPromise && !force) return this.initPromise;
    if (this.dictionaryLoaded && !force) return;

    this.initPromise = (async () => {
      await this.loadCustomDictionary();

      const dictionaries = settingsState.languageDictionaries || ['en-US'];
      const technicalDictionaries = settingsState.technicalDictionaries;
      const scienceDictionaries = settingsState.scienceDictionaries;

      try {
        await callBackend(
          'init_spellchecker',
          { dictionaries, technicalDictionaries, scienceDictionaries },
          'Spellcheck:Init',
          undefined,
          { ignore: true },
        );
      } catch (_error) {
        this.initPromise = null;
        this.dictionaryLoaded = false;
        return;
      }

      this.dictionaryLoaded = (await this.waitForInitCompletion()) === 'ready';
      if (!this.dictionaryLoaded) {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Resolves with the terminal status ("ready"|"failed"). Waits for the
   * backend status event instead of polling on a fixed window, so slow first
   * downloads no longer give up prematurely. A generous fallback timeout keeps
   * the promise from hanging forever if the event is never delivered.
   */
  private async waitForInitCompletion(): Promise<string> {
    return new Promise<string>((resolve) => {
      let settled = false;
      let unlisten: UnlistenFn = () => {};
      const finish = (status: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        unlisten();
        resolve(status);
      };

      const fallback = window.setTimeout(() => {
        logger.spellcheck.warn('Spellcheck init completion timed out');
        finish('failed');
      }, INIT_COMPLETION_FALLBACK_MS);

      const onEvent = (event: { payload: string }) => {
        if (event.payload === 'ready' || event.payload === 'failed') {
          finish(event.payload);
        }
      };

      // Register the listener first so a fast completion can't be missed, then
      // check the current status in case it already finished before we
      // subscribed. `finally` also covers IPC being unavailable.
      void listen<string>(SPELLCHECK_STATUS_EVENT, onEvent)
        .then(
          (fn) => {
            unlisten = fn;
          },
          () => {
            logger.spellcheck.warn('Spellcheck status listener unavailable');
          },
        )
        .finally(() => {
          void callBackend('get_spellcheck_status', {}, 'Spellcheck:Init', undefined, { ignore: true }).then(
            (status) => {
              if (status === 'ready' || status === 'failed') {
                finish(status);
              }
            },
          );
        });
    });
  }

  async refreshCustomDictionary(): Promise<void> {
    await this.loadCustomDictionary();
  }

  isWordValid(word: string): boolean {
    if (!this.dictionaryLoaded) return true;
    const w = stripPossessiveSuffix(word);
    if (this.customDictionary.has(w)) return true;
    return !this.misspelledCache.has(w);
  }

  private evictSuggestionCache() {
    if (this.suggestionCache.size > MAX_SUGGESTION_CACHE_SIZE) {
      this.suggestionCache.clear();
    }
  }

  addValidWord(word: string): void {
    if (this.validCache.size >= MAX_VALID_CACHE_SIZE) {
      this.validCache.clear();
    }
    this.validCache.add(word);
  }

  async prefetchSuggestions(word: string): Promise<void> {
    const w = word.trim();
    if (!w || !this.dictionaryLoaded) return;

    if (!this.misspelledCache.has(stripPossessiveSuffix(w))) return;

    if (this.suggestionCache.has(w) || this.pendingFetches.has(w)) return;

    this.pendingFetches.add(w);

    try {
      const suggestions = await callBackend('get_spelling_suggestions', { word: w }, 'Dictionary:Add', undefined, {
        ignore: true,
      });
      if (suggestions) {
        this.suggestionCache.set(w, suggestions);
        this.evictSuggestionCache();
      }
    } finally {
      this.pendingFetches.delete(w);
    }
  }

  getCachedSuggestions(word: string): string[] | undefined {
    return this.suggestionCache.get(word);
  }

  async getSuggestions(word: string): Promise<string[]> {
    if (!this.dictionaryLoaded || !word) return [];

    if (this.suggestionCache.has(word)) {
      return this.suggestionCache.get(word) ?? [];
    }

    const suggestions = await callBackend('get_spelling_suggestions', { word }, 'Dictionary:Add', undefined, {
      report: true,
    });
    if (suggestions) {
      this.suggestionCache.set(word, suggestions);
      this.evictSuggestionCache();
      return suggestions;
    }
    return [];
  }

  clear(): void {
    this.customDictionary.clear();
    this.misspelledCache.clear();
    this.suggestionCache.clear();
    this.validCache.clear();
    this.dictionaryLoaded = false;
    this.linterFailedNotified = false;
    this.initPromise = null;
  }
}

export const spellcheckState = new SpellcheckManager();
