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
            try {
                await this.loadCustomDictionary();

                const dictionaries = appState.languageDictionaries || ['en-US'];
                const technicalDictionaries = appState.technicalDictionaries;
                const scienceDictionaries = appState.scienceDictionaries;

                await callBackend(
                    'init_spellchecker',
                    { dictionaries, technicalDictionaries, scienceDictionaries },
                    'Spellcheck:Init',
                    undefined,
                    {
                        report: true,
                    },
                );
                this.dictionaryLoaded = true;
            } catch (_err) {
                this.initPromise = null;
                this.dictionaryLoaded = false;
            }
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
