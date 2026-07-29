/**
 * Spellcheck State Management
 *
 * This file uses Svelte 5 runes for all spellcheck-related state.
 * All properties are reactive and trigger UI updates when changed.
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { callBackend } from './backend';

const MAX_SUGGESTION_CACHE_SIZE = 200;
const MAX_VALID_CACHE_SIZE = 5000;

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

      const maxAttempts = 50; // 5 seconds max
      const pollInterval = 100; // 100ms

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const status = await callBackend('get_spellcheck_status', {}, 'Spellcheck:Init', undefined, { ignore: true });

        if (status === 'ready') {
          this.dictionaryLoaded = true;
          return;
        } else if (status === 'failed') {
          this.initPromise = null;
          this.dictionaryLoaded = false;
          return;
        }

        // Still loading, wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
      this.initPromise = null;
      this.dictionaryLoaded = false;
    })();

    return this.initPromise;
  }

  async refreshCustomDictionary(): Promise<void> {
    await this.loadCustomDictionary();
  }

  isWordValid(word: string): boolean {
    if (!this.dictionaryLoaded) return true;
    const w = word.toLowerCase();
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

    if (!this.misspelledCache.has(w.toLowerCase())) return;

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
