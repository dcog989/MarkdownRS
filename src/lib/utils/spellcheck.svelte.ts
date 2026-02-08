/**
 * Spellcheck State Management
 *
 * This file uses Svelte 5 runes for all spellcheck-related state.
 * All properties are reactive and trigger UI updates when changed.
 *
 * Pattern: Class-based reactive state with $state()
 * - dictionaryLoaded: Boolean for initialization status
 * - misspelledCache: SvelteSet of currently misspelled words
 * - customDictionary: SvelteSet of user-added words
 * - suggestionCache: SvelteMap of word -> suggestions
 *
 * Why not non-reactive caches here?
 * - All spellcheck state is displayed in the UI (underlines, suggestions, etc.)
 * - SvelteSet/SvelteMap work well with $state for this use case
 * - No deep proxy chains that would cause stack overflow
 */

import { appState } from '$lib/stores/appState.svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { callBackend } from './backend';

export class SpellcheckManager {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new SvelteSet<string>());
    customDictionary = $state(new SvelteSet<string>());
    suggestionCache = $state(new SvelteMap<string, string[]>());

    private initPromise: Promise<void> | null = null;
    private pendingFetches = new SvelteSet<string>();

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

            const dictionaries = appState.languageDictionaries || ['en-US'];
            const technicalDictionaries = appState.technicalDictionaries;
            const scienceDictionaries = appState.scienceDictionaries;

            try {
                await callBackend(
                    'init_spellchecker',
                    { dictionaries, technicalDictionaries, scienceDictionaries },
                    'Spellcheck:Init',
                    undefined,
                    { ignore: true },
                );
            } catch (error) {
                console.error('[Spellcheck] Initialization failed:', error);
                this.initPromise = null;
                this.dictionaryLoaded = false;
                return;
            }

            const maxAttempts = 50; // 5 seconds max
            const pollInterval = 100; // 100ms

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const status = await callBackend(
                    'get_spellcheck_status',
                    {},
                    'Spellcheck:Init',
                    undefined,
                    { ignore: true },
                );

                if (status === 'ready') {
                    this.dictionaryLoaded = true;
                    return;
                } else if (status === 'failed') {
                    console.error('[Spellcheck] Backend initialization failed');
                    this.initPromise = null;
                    this.dictionaryLoaded = false;
                    return;
                }

                // Still loading, wait and retry
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
            }

            // Timeout
            console.error('[Spellcheck] Initialization timeout - dictionary never became ready');
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

    async prefetchSuggestions(word: string): Promise<void> {
        const w = word.trim();
        if (!w || !this.dictionaryLoaded) return;

        // Only fetch if linter has marked it as misspelled
        if (!this.misspelledCache.has(w.toLowerCase())) return;

        if (this.suggestionCache.has(w) || this.pendingFetches.has(w)) return;

        this.pendingFetches.add(w);

        try {
            const suggestions = await callBackend(
                'get_spelling_suggestions',
                { word: w },
                'Dictionary:Add',
                undefined,
                { ignore: true },
            );
            if (suggestions) this.suggestionCache.set(w, suggestions);
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
            return this.suggestionCache.get(word)!;
        }

        const suggestions = await callBackend(
            'get_spelling_suggestions',
            { word },
            'Dictionary:Add',
            undefined,
            {
                report: true,
            },
        );
        if (suggestions) {
            this.suggestionCache.set(word, suggestions);
            return suggestions;
        }
        return [];
    }

    getCustomDictionarySet(): SvelteSet<string> {
        return new SvelteSet(this.customDictionary);
    }

    clear(): void {
        this.customDictionary.clear();
        this.misspelledCache.clear();
        this.suggestionCache.clear();
        this.dictionaryLoaded = false;
        this.initPromise = null;
    }
}

export const spellcheckState = new SpellcheckManager();

// Backward compatibility exports
export const initSpellcheck = () => spellcheckState.init();
export const refreshCustomDictionary = () => spellcheckState.refreshCustomDictionary();
export const isWordValid = (w: string) => spellcheckState.isWordValid(w);
export const prefetchSuggestions = (w: string) => spellcheckState.prefetchSuggestions(w);
export const getCachedSuggestions = (w: string) => spellcheckState.getCachedSuggestions(w);
export const getSuggestions = (w: string) => spellcheckState.getSuggestions(w);
export const getCustomDictionary = () => spellcheckState.getCustomDictionarySet();
export const clearDictionaries = () => spellcheckState.clear();
