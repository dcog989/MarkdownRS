import { callBackend } from './backend';
import { AppError } from './errorHandling';

export class SpellcheckState {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new Set<string>());
    customDictionary = $state(new Set<string>());
    suggestionCache = new Map<string, string[]>();
}

export const spellcheckState = new SpellcheckState();
let initPromise: Promise<void> | null = null;
const pendingFetches = new Set<string>();

async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await callBackend('get_custom_dictionary', {}, 'Dictionary:Add');
        spellcheckState.customDictionary = new Set(words.map(w => w.toLowerCase()));
    } catch (err) {
        AppError.handle('Dictionary:Add', err, { showToast: false, severity: 'warning' });
        spellcheckState.customDictionary = new Set();
    }
}

export async function initSpellcheck(): Promise<void> {
    if (initPromise) return initPromise;
    if (spellcheckState.dictionaryLoaded) return;

    initPromise = (async () => {
        try {
            await loadCustomDictionary();

            // Get selected dictionaries from settings
            const { appContext } = await import('../stores/state.svelte');
            const dictionaries = appContext.app.spellcheckDictionaries || ['en'];
            const specialistDictionaries = appContext.app.specialistDictionaries || ['software-terms', 'companies'];

            await callBackend('init_spellchecker', { dictionaries, specialistDictionaries }, 'Editor:Init');
            spellcheckState.dictionaryLoaded = true;
        } catch (err) {
            AppError.handle('Spellcheck:Init', err, { showToast: false, severity: 'warning' });
            initPromise = null; // Clear promise to allow retry
        }
    })();

    return initPromise;
}

export async function refreshCustomDictionary(): Promise<void> {
    await loadCustomDictionary();
}

export function isWordValid(word: string): boolean {
    if (!spellcheckState.dictionaryLoaded) return true;
    const w = word.toLowerCase();
    if (spellcheckState.customDictionary.has(w)) return true;
    return !spellcheckState.misspelledCache.has(w);
}

export async function prefetchSuggestions(word: string): Promise<void> {
    const w = word.trim();
    if (!w || !spellcheckState.dictionaryLoaded) return;

    // Only fetch if linter has marked it as misspelled
    if (!spellcheckState.misspelledCache.has(w.toLowerCase())) return;

    if (spellcheckState.suggestionCache.has(w) || pendingFetches.has(w)) return;

    pendingFetches.add(w);

    try {
        const suggestions = await callBackend('get_spelling_suggestions', { word: w }, 'Dictionary:Add');
        spellcheckState.suggestionCache.set(w, suggestions);
    } catch (err) {
        // Silent fail for prefetch
    } finally {
        pendingFetches.delete(w);
    }
}

export function getCachedSuggestions(word: string): string[] | undefined {
    return spellcheckState.suggestionCache.get(word);
}

export async function getSuggestions(word: string): Promise<string[]> {
    if (!spellcheckState.dictionaryLoaded || !word) return [];

    if (spellcheckState.suggestionCache.has(word)) {
        return spellcheckState.suggestionCache.get(word)!;
    }

    try {
        const suggestions = await callBackend('get_spelling_suggestions', { word }, 'Dictionary:Add');
        spellcheckState.suggestionCache.set(word, suggestions);
        return suggestions;
    } catch (err) {
        AppError.handle('Dictionary:Add', err, { showToast: false, severity: 'warning' });
        return [];
    }
}

export function getCustomDictionary(): Set<string> {
    return new Set(spellcheckState.customDictionary);
}

export function clearDictionaries(): void {
    spellcheckState.customDictionary.clear();
    spellcheckState.misspelledCache.clear();
    spellcheckState.suggestionCache.clear();
    spellcheckState.dictionaryLoaded = false;
    initPromise = null;
}
