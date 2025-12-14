import { invoke } from '@tauri-apps/api/core';

let customDictionary: Set<string> = new Set();
let dictionaryLoaded = false;

/**
 * Load custom dictionary from Rust backend
 */
async function loadCustomDictionary(): Promise<void> {
    try {
        const words = await invoke<string[]>('get_custom_dictionary');
        customDictionary = new Set(words.map(w => w.toLowerCase()));
        dictionaryLoaded = true;
    } catch (err) {
        console.warn('Failed to load custom dictionary:', err);
        customDictionary = new Set();
        dictionaryLoaded = true;
    }
}

/**
 * Refresh the custom dictionary from disk
 */
export async function refreshCustomDictionary(): Promise<void> {
    await loadCustomDictionary();
}

/**
 * Check if a word is in the custom dictionary
 */
export function isInCustomDictionary(word: string): boolean {
    return customDictionary.has(word.toLowerCase());
}

/**
 * Get all words in the custom dictionary
 */
export function getCustomDictionary(): Set<string> {
    return customDictionary;
}

/**
 * Initialize the custom dictionary (should be called on app startup)
 */
export async function initCustomDictionary(): Promise<void> {
    if (!dictionaryLoaded) {
        await loadCustomDictionary();
    }
}
