import { callBackend } from './backend';
import { AppError } from './errorHandling';

export class SpellcheckState {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new Set<string>());
    customDictionary: Set<string> = new Set();
}

export const spellcheckState = new SpellcheckState();
let initPromise: Promise<void> | null = null;

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

            await callBackend('init_spellchecker', { dictionaries }, 'Editor:Init');
            spellcheckState.dictionaryLoaded = true;
        } catch (err) {
            AppError.handle('Spellcheck:Init', err, { showToast: false, severity: 'warning' });
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

export async function getSuggestions(word: string): Promise<string[]> {
    if (!spellcheckState.dictionaryLoaded || !word) return [];
    try {
        return await callBackend('get_spelling_suggestions', { word }, 'Dictionary:Add');
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
    spellcheckState.dictionaryLoaded = false;
    initPromise = null;
}
