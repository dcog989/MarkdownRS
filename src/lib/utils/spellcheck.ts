import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';

let customDictionary: Set<string> = new Set();
let baseDictionary: Set<string> = new Set();
let baseDictionaryRaw: string = "";
let dictionaryLoaded = false;
let initPromise: Promise<void> | null = null;
let store: Store | null = null;

const DICT_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';

async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await invoke<string[]>('get_custom_dictionary');
        customDictionary = new Set(words.map(w => w.toLowerCase()));
    } catch (err) {
        console.warn('Failed to load custom dictionary:', err);
        customDictionary = new Set();
    }
}

async function loadBaseDictionary(): Promise<void> {
    try {
        if (!store) {
            store = await Store.load('dictionary_cache.json', { autoSave: false, defaults: {} });
        }

        const cached = await store.get<string>('base_dictionary');
        if (cached) {
            baseDictionaryRaw = cached;
            parseDictionary(cached);
            return;
        }

        const response = await fetch(DICT_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();

        baseDictionaryRaw = text;
        await store.set('base_dictionary', text);
        await store.save();

        parseDictionary(text);
    } catch (err) {
        console.error('Failed to load base dictionary:', err);
        baseDictionary = new Set();
    }
}

function parseDictionary(text: string) {
    const words = text.split(/\r?\n/);
    baseDictionary = new Set();
    for (const word of words) {
        const trimmed = word.trim();
        if (trimmed.length > 1) {
            baseDictionary.add(trimmed.toLowerCase());
        }
    }
}

export async function initSpellcheck(): Promise<void> {
    if (initPromise) return initPromise;
    if (dictionaryLoaded) return;

    initPromise = (async () => {
        await Promise.all([loadCustomDictionary(), loadBaseDictionary()]);
        dictionaryLoaded = true;
    })();

    return initPromise;
}

export async function refreshCustomDictionary(): Promise<void> {
    await loadCustomDictionary();
}

export function isWordValid(word: string): boolean {
    if (!dictionaryLoaded || baseDictionary.size === 0) return true;

    const w = word.toLowerCase();
    if (baseDictionary.has(w) || customDictionary.has(w)) return true;

    if (w.endsWith("'s")) {
        const base = w.slice(0, -2);
        if (baseDictionary.has(base) || customDictionary.has(base)) return true;
    }

    if (w.endsWith("'")) {
        const base = w.slice(0, -1);
        if (baseDictionary.has(base) || customDictionary.has(base)) return true;
    }

    return false;
}

export async function getSuggestions(word: string): Promise<string[]> {
    if (!dictionaryLoaded || !word) return [];

    try {
        const results = await invoke<string[]>('get_spelling_suggestions', {
            word,
            customDict: Array.from(customDictionary),
            baseDictRaw: baseDictionaryRaw
        });
        return results;
    } catch (err) {
        console.error('Failed to get suggestions from backend:', err);
        return [];
    }
}

export function getCustomDictionary(): Set<string> {
    return new Set(customDictionary);
}

export function clearDictionaries(): void {
    customDictionary.clear();
    baseDictionary.clear();
    baseDictionaryRaw = "";
    dictionaryLoaded = false;
    initPromise = null;
}
