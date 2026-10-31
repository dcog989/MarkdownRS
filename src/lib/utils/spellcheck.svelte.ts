/**
 * Spellcheck State Management
 *
 * This file uses Svelte 5 runes for all spellcheck-related state.
 * All properties are reactive and trigger UI updates when changed.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { callBackend } from "./backend";
import { logger } from "./logger";

const MAX_SUGGESTION_CACHE_SIZE = 200;
const MAX_VALID_CACHE_SIZE = 5000;

// Emitted by the backend when spellcheck initialization finishes. Payload is
// the terminal status string: "ready" or "failed".
const SPELLCHECK_STATUS_EVENT = "spellcheck-status";
// Safety net in case no event ever arrives (backend panic/IPC failure).
const INIT_COMPLETION_FALLBACK_MS = 60_000;

// A word is a run of Unicode letters, optionally with an inner apostrophe
// (straight or typographic). The lookarounds keep identifier fragments such as
// `foo_bar` intact. Use it with `match`/`matchAll`: `exec` would share
// `lastIndex` between the two editor panes.
export const SPELLCHECK_WORD_PATTERN = /(?<![\p{L}\p{N}_])\p{L}+(?:['’]\p{L}+)?(?![\p{L}\p{N}_])/gu;

// The linter stores possessive forms ("word's") under their base ("word") in
// both validCache and misspelledCache, and the custom dictionary holds base
// forms too, so every lookup must strip the suffix through this single helper
// (preserving the original casing for display) to avoid logic drift. The
// custom dictionary is matched case-insensitively, but the valid/misspelled
// caches preserve case to match the backend's case-sensitive checking.
export function stripPossessiveSuffix(word: string): string {
  const lower = word.toLowerCase();
  return lower.endsWith("'s") || lower.endsWith("’s") ? word.slice(0, -2) : word;
}

export class SpellcheckManager {
  dictionaryLoaded = $state(false);
  misspelledCache = $state(new SvelteSet<string>());
  customDictionary = $state(new SvelteSet<string>());
  suggestionCache = $state(new SvelteMap<string, string[]>());
  validCache = new Set<string>();
  linterFailedNotified = false;

  private initPromise: Promise<boolean | null> | null = null;
  private initGeneration = 0;
  private pendingFetches = new Set<string>();

  async loadCustomDictionary(): Promise<void> {
    const words = await callBackend("load_user_dictionary", {}, "Dictionary:Add", undefined, {
      ignore: true,
    });
    // A failed read must not wipe the words already in memory; only a real
    // (possibly empty) list replaces the set.
    if (!words) return;
    this.customDictionary = new SvelteSet(words.map((w) => w.toLowerCase()));
  }

  async init(force = false): Promise<boolean | null> {
    if (this.dictionaryLoaded && !force) return true;
    if (this.initPromise) {
      if (!force) return this.initPromise;
      // Never stack concurrent inits: let the in-flight one settle, then start
      // a fresh build for the (possibly changed) configuration.
      await this.initPromise;
    }

    const generation = ++this.initGeneration;
    this.initPromise = this.runInit(generation);
    return this.initPromise;
  }

  /** True when ready, false on failure, null when a newer init superseded this one. */
  private async runInit(generation: number): Promise<boolean | null> {
    try {
      await this.loadCustomDictionary();

      const dictionaries = settingsState.languageDictionaries || ["en-US"];
      const technicalDictionaries = settingsState.technicalDictionaries;
      const scienceDictionaries = settingsState.scienceDictionaries;

      // A failed invoke is not observable here (the command returns `()`, and
      // `ignore` turns errors into null), so the status probe below is the
      // failure signal.
      await callBackend(
        "init_spellchecker",
        { dictionaries, technicalDictionaries, scienceDictionaries },
        "Spellcheck:Init",
        undefined,
        { ignore: true },
      );

      const status = await this.waitForInitCompletion(generation);
      if (generation !== this.initGeneration) return null;
      this.dictionaryLoaded = status === "ready";
      return this.dictionaryLoaded;
    } finally {
      // A stale closure (superseded or cleared) must not clobber a newer init.
      if (generation === this.initGeneration) {
        this.initPromise = null;
      }
    }
  }

  /**
   * Resolves with the terminal status ("ready"|"failed"). Waits for the
   * backend status event instead of polling on a fixed window, so slow first
   * downloads no longer give up prematurely.
   */
  private async waitForInitCompletion(generation: number): Promise<string> {
    return new Promise<string>((resolve) => {
      let settled = false;
      let unlisten: UnlistenFn = () => {};
      const finish = (status: string) => {
        window.clearTimeout(fallback);
        unlisten();
        if (settled) return;
        settled = true;
        resolve(status);
      };

      // The timeout only releases the caller so the settings toast is not left
      // hanging. The listener stays registered: a first download can outlast
      // this window, and a late "ready" must still turn spellcheck on instead
      // of waiting for the next restart.
      const fallback = window.setTimeout(() => {
        logger.spellcheck.warn("Spellcheck init still running after timeout");
        if (settled) return;
        settled = true;
        resolve("failed");
      }, INIT_COMPLETION_FALLBACK_MS);

      const onEvent = (event: { payload: string }) => {
        if (event.payload !== "ready" && event.payload !== "failed") return;
        if (event.payload === "ready" && generation === this.initGeneration) {
          this.dictionaryLoaded = true;
        }
        finish(event.payload);
      };

      // Register the listener first so a fast completion can't be missed, then
      // check the current status in case it already finished before we
      // subscribed. `finally` also covers IPC being unavailable.
      void listen<string>(SPELLCHECK_STATUS_EVENT, onEvent)
        .then(
          (fn) => {
            unlisten = fn;
          },
          () => {
            logger.spellcheck.warn("Spellcheck status listener unavailable");
          },
        )
        .finally(() => {
          void callBackend("get_spellcheck_status", {}, "Spellcheck:Init", undefined, { ignore: true }).then(
            (status) => {
              if (status === "ready" || status === "failed") {
                if (status === "ready" && generation === this.initGeneration) {
                  this.dictionaryLoaded = true;
                }
                finish(status);
              } else if (status === "uninitialized") {
                // The command failed before the backend could start a build.
                finish("failed");
              }
            },
          );
        });
    });
  }

  async refreshCustomDictionary(): Promise<void> {
    await this.loadCustomDictionary();
  }

  isWordValid(word: string): boolean {
    if (!this.dictionaryLoaded) return true;
    const w = stripPossessiveSuffix(word);
    if (this.customDictionary.has(w.toLowerCase())) return true;
    return !this.misspelledCache.has(w);
  }

  private evictSuggestionCache() {
    if (this.suggestionCache.size > MAX_SUGGESTION_CACHE_SIZE) {
      this.suggestionCache.clear();
    }
  }

  addValidWord(word: string): void {
    if (this.validCache.size >= MAX_VALID_CACHE_SIZE) {
      this.validCache.clear();
    }
    this.validCache.add(word);
  }

  async prefetchSuggestions(word: string): Promise<void> {
    const w = word.trim();
    if (!w || !this.dictionaryLoaded) return;

    if (!this.misspelledCache.has(stripPossessiveSuffix(w))) return;

    if (this.suggestionCache.has(w) || this.pendingFetches.has(w)) return;

    this.pendingFetches.add(w);

    try {
      const suggestions = await callBackend("get_spelling_suggestions", { word: w }, "Spellcheck:Suggest", undefined, {
        ignore: true,
      });
      if (suggestions) {
        this.suggestionCache.set(w, suggestions);
        this.evictSuggestionCache();
      }
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
      return this.suggestionCache.get(word) ?? [];
    }

    const suggestions = await callBackend("get_spelling_suggestions", { word }, "Spellcheck:Suggest", undefined, {
      report: true,
    });
    if (suggestions) {
      this.suggestionCache.set(word, suggestions);
      this.evictSuggestionCache();
      return suggestions;
    }
    return [];
  }

  clear(): void {
    this.initGeneration++;
    this.initPromise = null;
    this.customDictionary.clear();
    this.misspelledCache.clear();
    this.suggestionCache.clear();
    this.validCache.clear();
    this.dictionaryLoaded = false;
    this.linterFailedNotified = false;
  }
}

export const spellcheckState = new SpellcheckManager();
