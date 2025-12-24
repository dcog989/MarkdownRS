import { callBackend } from './backend';

export class SpellcheckState {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new Set<string>());
    customDictionary: Set<string> = new Set();
}

export const spellcheckState = new SpellcheckState();
let initPromise: Promise<void> | null = null;

async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await callBackend<string[]>('get_custom_dictionary', {}, 'Dictionary:Add');
        spellcheckState.customDictionary = new Set(words.map(w => w.toLowerCase()));
    } catch (err) {
        spellcheckState.customDictionary = new Set();
    }
}

export async function initSpellcheck(): Promise<void> {
    if (initPromise) return initPromise;
    if (spellcheckState.dictionaryLoaded) return;

    initPromise = (async () => {
        try {
            await loadCustomDictionary();
            await callBackend('init_spellchecker', {}, 'Editor:Init');
            spellcheckState.dictionaryLoaded = true;
        } catch (err) {
            console.error("[Spellcheck] Error: Initialization failed:", err);
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
        return await callBackend<string[]>('get_spelling_suggestions', { word }, 'Dictionary:Add');
    } catch (err) {
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
