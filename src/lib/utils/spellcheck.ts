import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';

let customDictionary: Set<string> = new Set();
let baseDictionary: Set<string> = new Set();
let dictionaryLoaded = false;
let initPromise: Promise<void> | null = null;
let store: Store | null = null;

const DICT_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';

/**
 * Load the custom dictionary from Rust backend
 */
async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await invoke<string[]>('get_custom_dictionary');
        customDictionary = new Set(words.map(w => w.toLowerCase()));
    } catch (err) {
        console.warn('Failed to load custom dictionary:', err);
        customDictionary = new Set();
    }
}

/**
 * Fetch and load the base English dictionary
 * Caches it in the Tauri store to avoid repeated downloads
 */
async function loadBaseDictionary(): Promise<void> {
    try {
        if (!store) {
            store = await Store.load('dictionary_cache.json');
        }

        // Try to get from cache first
        const cached = await store.get<string>('base_dictionary');
        if (cached) {
            parseDictionary(cached);
            return;
        }

        // Fetch from CDN if not cached
        console.log('Fetching base dictionary...');
        const response = await fetch(DICT_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();

        // Cache it
        await store.set('base_dictionary', text);
        await store.save();

        parseDictionary(text);
    } catch (err) {
        console.error('Failed to load base dictionary:', err);
        // Fallback to a minimal list if offline/failed
        baseDictionary = new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 
            'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'markdown', 'rust', 'tauri', 'svelte', 'typescript', 'javascript'
        ]);
    }
}

function parseDictionary(text: string) {
    const words = text.split(/\r?\n/);
    baseDictionary = new Set();
    
    // Filter and normalize words
    for (const word of words) {
        const trimmed = word.trim();
        if (trimmed.length > 1) {
            baseDictionary.add(trimmed.toLowerCase());
        }
    }
    console.log(`Dictionary loaded: ${baseDictionary.size} words`);
}

/**
 * Initialize dictionaries (singleton pattern)
 */
export async function initSpellcheck(): Promise<void> {
    // Return existing initialization if in progress
    if (initPromise) return initPromise;
    
    // Already initialized
    if (dictionaryLoaded) return;

    // Start new initialization
    initPromise = (async () => {
        try {
            await Promise.all([loadCustomDictionary(), loadBaseDictionary()]);
            dictionaryLoaded = true;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

/**
 * Refresh the custom dictionary from disk
 */
export async function refreshCustomDictionary(): Promise<void> {
    await loadCustomDictionary();
}

/**
 * Check if a word is valid (exists in base or custom dictionary)
 */
export function isWordValid(word: string): boolean {
    if (!dictionaryLoaded) return true; // Don't mark as error if still loading
    const w = word.toLowerCase();
    return baseDictionary.has(w) || customDictionary.has(w);
}

/**
 * Get all words in the custom dictionary
 */
export function getCustomDictionary(): Set<string> {
    return new Set(customDictionary); // Return copy to prevent mutations
}

/**
 * Clear cached dictionaries (useful for testing)
 */
export function clearDictionaries(): void {
    customDictionary.clear();
    baseDictionary.clear();
    dictionaryLoaded = false;
    initPromise = null;
}
