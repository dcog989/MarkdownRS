import { callBackend } from './backend';
import { AppError } from './errorHandling';

export class SpellcheckManager {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new Set<string>());
    customDictionary = $state(new Set<string>());
    suggestionCache = $state(new Map<string, string[]>());

    private initPromise: Promise<void> | null = null;
    private pendingFetches = new Set<string>();

    async loadCustomDictionary(): Promise<void> {
        try {
            const words = await callBackend('get_custom_dictionary', {}, 'Dictionary:Add');
            this.customDictionary = new Set(words.map(w => w.toLowerCase()));
        } catch (err) {
            AppError.handle('Dictionary:Add', err, { showToast: false, severity: 'warning' });
            this.customDictionary = new Set();
        }
    }

    async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        if (this.dictionaryLoaded) return;

        this.initPromise = (async () => {
            try {
                await this.loadCustomDictionary();

                // Get selected dictionaries from settings (dynamic import to avoid circular dep if needed, or assume global context available)
                const { appContext } = await import('../stores/state.svelte');
                const dictionaries = appContext.app.spellcheckDictionaries || ['en'];
                const specialistDictionaries = appContext.app.specialistDictionaries || ['software-terms', 'companies'];

                await callBackend('init_spellchecker', { dictionaries, specialistDictionaries }, 'Editor:Init');
                this.dictionaryLoaded = true;
            } catch (err) {
                AppError.handle('Spellcheck:Init', err, { showToast: false, severity: 'warning' });
                this.initPromise = null;
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
            const suggestions = await callBackend('get_spelling_suggestions', { word: w }, 'Dictionary:Add');
            this.suggestionCache.set(w, suggestions);
        } catch (err) {
            // Silent fail for prefetch
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

        try {
            const suggestions = await callBackend('get_spelling_suggestions', { word }, 'Dictionary:Add');
            this.suggestionCache.set(word, suggestions);
            return suggestions;
        } catch (err) {
            AppError.handle('Dictionary:Add', err, { showToast: false, severity: 'warning' });
            return [];
        }
    }

    getCustomDictionarySet(): Set<string> {
        return new Set(this.customDictionary);
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

// Backward compatibility exports / Shortcuts
export const initSpellcheck = () => spellcheckState.init();
export const refreshCustomDictionary = () => spellcheckState.refreshCustomDictionary();
export const isWordValid = (w: string) => spellcheckState.isWordValid(w);
export const prefetchSuggestions = (w: string) => spellcheckState.prefetchSuggestions(w);
export const getCachedSuggestions = (w: string) => spellcheckState.getCachedSuggestions(w);
export const getSuggestions = (w: string) => spellcheckState.getSuggestions(w);
export const getCustomDictionary = () => spellcheckState.getCustomDictionarySet();
export const clearDictionaries = () => spellcheckState.clear();
