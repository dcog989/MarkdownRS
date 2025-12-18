import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';

class SpellcheckState {
    dictionaryLoaded = $state(false);
    misspelledCache = $state(new Set<string>());
    customDictionary: Set<string> = new Set();
    baseDictionaryRaw: string = "";
}

export const spellcheckState = new SpellcheckState();
let initPromise: Promise<void> | null = null;
let store: Store | null = null;

const DICT_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';

async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await invoke<string[]>('get_custom_dictionary');
        spellcheckState.customDictionary = new Set(words.map(w => w.toLowerCase()));
    } catch (err) {
        spellcheckState.customDictionary = new Set();
    }
}

async function loadBaseDictionary(): Promise<void> {
    try {
        if (!store) {
            store = await Store.load('dictionary_cache.json', { autoSave: false, defaults: {} });
        }

        let text = await store.get<string>('base_dictionary');
        if (!text) {
            const response = await fetch(DICT_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            text = await response.text();
            await store.set('base_dictionary', text);
            await store.save();
        }
        spellcheckState.baseDictionaryRaw = text;
    } catch (err) {
        console.error('Failed to load base dictionary:', err);
    }
}

export async function initSpellcheck(): Promise<void> {
    if (initPromise) return initPromise;
    if (spellcheckState.dictionaryLoaded) return;

    initPromise = (async () => {
        await Promise.all([loadCustomDictionary(), loadBaseDictionary()]);

        await invoke('init_spellchecker', {
            dictionaryData: spellcheckState.baseDictionaryRaw
        });

        spellcheckState.dictionaryLoaded = true;
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
        return await invoke<string[]>('get_spelling_suggestions', { word });
    } catch (err) {
        return [];
    }
}

export function getCustomDictionary(): Set<string> {
    return new Set(spellcheckState.customDictionary);
}

export function clearDictionaries(): void {
    spellcheckState.customDictionary.clear();
    spellcheckState.baseDictionaryRaw = "";
    spellcheckState.misspelledCache.clear();
    spellcheckState.dictionaryLoaded = false;
    initPromise = null;
}
