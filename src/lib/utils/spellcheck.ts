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
        console.log(`Custom dictionary loaded: ${customDictionary.size} words`);
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
            const storePath = 'dictionary_cache.json';
            store = await Store.load(storePath, { autoSave: false, defaults: {} });
        }

        // Try to get from cache first
        const cached = await store.get<string>('base_dictionary');
        if (cached) {
            parseDictionary(cached);
            console.log(`Base dictionary loaded from cache: ${baseDictionary.size} words`);
            return;
        }

        // Fetch from CDN if not cached
        console.log('Fetching base dictionary from network...');
        const response = await fetch(DICT_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();

        // Cache it
        await store.set('base_dictionary', text);
        await store.save();

        parseDictionary(text);
        console.log(`Base dictionary loaded from network: ${baseDictionary.size} words`);
    } catch (err) {
        console.error('Failed to load base dictionary:', err);
        baseDictionary = new Set();
        console.log('Spellcheck disabled due to dictionary load failure');
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
}

/**
 * Initialize dictionaries (singleton pattern)
 */
export async function initSpellcheck(): Promise<void> {
    if (initPromise) return initPromise;
    if (dictionaryLoaded) return;

    initPromise = (async () => {
        try {
            await Promise.all([loadCustomDictionary(), loadBaseDictionary()]);
            // Always set loaded to true after attempting to load
            dictionaryLoaded = true;
            if (baseDictionary.size > 0) {
                console.log(`Spellcheck initialized successfully with ${baseDictionary.size} words`);
            } else {
                console.error('Failed to load any dictionary words - spellcheck will be disabled');
            }
        } catch (err) {
            console.error('Error initializing spellcheck:', err);
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}

export async function refreshCustomDictionary(): Promise<void> {
    await loadCustomDictionary();
}

/**
 * Check if a word is valid, handling possessives
 */
export function isWordValid(word: string): boolean {
    // If dictionary isn't loaded OR is empty, return true to avoid marking everything as misspelled
    if (!dictionaryLoaded || baseDictionary.size === 0) {
        return true;
    }

    const w = word.toLowerCase();

    // Direct dictionary check
    if (baseDictionary.has(w) || customDictionary.has(w)) {
        return true;
    }

    // Handle possessives: "repository's" -> check "repository"
    if (w.endsWith("'s")) {
        const base = w.slice(0, -2);
        if (baseDictionary.has(base) || customDictionary.has(base)) {
            return true;
        }
    }

    // Handle plural possessives: "repositories'" -> check "repositories" and "repository"
    if (w.endsWith("'")) {
        const base = w.slice(0, -1);
        if (baseDictionary.has(base) || customDictionary.has(base)) {
            return true;
        }
    }

    return false;
}

export function getCustomDictionary(): Set<string> {
    return new Set(customDictionary);
}

export function clearDictionaries(): void {
    customDictionary.clear();
    baseDictionary.clear();
    dictionaryLoaded = false;
    initPromise = null;
}

/**
 * Calculate Levenshtein distance between two strings
 * Optimized for speed (early exit not included here to keep it simple, but strictly limited loop)
 */
function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Get spelling suggestions for a word, handling possessives
 */
export function getSuggestions(word: string, maxSuggestions = 3): string[] {
    if (!dictionaryLoaded || !word) return [];

    let target = word.toLowerCase();
    let suffix = '';

    // Handle possessives - get suggestions for base word then add suffix back
    if (target.endsWith("'s")) {
        suffix = "'s";
        target = target.slice(0, -2);
    } else if (target.endsWith("'")) {
        suffix = "'";
        target = target.slice(0, -1);
    }

    const candidates: { word: string; score: number }[] = [];
    const maxDistance = 2; // Strict distance limit

    // Performance optimization:
    // Only check words that start with same letter (unless word is very short)
    // and are within +/- 2 length difference
    const checkFirstChar = target.length > 3;
    const firstChar = target[0];

    // Combine dictionaries for search
    const allWords = [baseDictionary, customDictionary];

    for (const dict of allWords) {
        for (const candidate of dict) {
            // Filter 1: Length check (very fast)
            if (Math.abs(candidate.length - target.length) > maxDistance) continue;

            // Filter 2: First char check (fast)
            if (checkFirstChar && candidate[0] !== firstChar) continue;

            // Calc distance (expensive)
            const dist = levenshtein(target, candidate);

            if (dist <= maxDistance) {
                candidates.push({ word: candidate + suffix, score: dist });
            }
        }
    }

    // Sort by score (lower is better)
    return candidates
        .sort((a, b) => a.score - b.score)
        .slice(0, maxSuggestions)
        .map(c => c.word);
}
