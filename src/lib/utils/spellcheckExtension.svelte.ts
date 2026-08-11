import { forceLinting } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { SvelteSet } from 'svelte/reactivity';
import { addWordsToDictionary } from '$lib/services/dictionaryService';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import {
  applyImmediateSpellcheck,
  createSpellCheckLinter,
  spellcheckRefreshEffect,
  triggerImmediateLint,
} from './spellcheckLinter';

export { applyImmediateSpellcheck, createSpellCheckLinter, triggerImmediateLint };

export function invalidateSpellcheckCache() {
  spellcheckState.validCache.clear();
  spellcheckState.misspelledCache.clear();
}

export async function refreshSpellcheck(view: EditorView | undefined) {
  if (!view) return;

  invalidateSpellcheckCache();

  await spellcheckState.refreshCustomDictionary();
  spellcheckState.misspelledCache = new SvelteSet<string>();
  triggerImmediateLint(view);
}

export const spellCheckKeymap = [
  {
    key: 'F8',
    run: (view: EditorView) => {
      const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
      let words: string[] = [];

      if (selection && selection.trim().length > 0) {
        words = selection.split(/\s+/).map((w) => w.replace(/[^a-zA-Z'-]/g, ''));
      } else {
        const range = view.state.wordAt(view.state.selection.main.head);
        if (range) {
          words = [view.state.sliceDoc(range.from, range.to).replace(/[^a-zA-Z'-]/g, '')];
        }
      }

      // Only add words that are not already valid, matching the context-menu
      // "Add to Dictionary" semantics, and batch them into a single backend call.
      const invalidWords = words.filter((w) => w.length > 1 && !spellcheckState.isWordValid(w));
      if (invalidWords.length === 0) return true;

      const newDict = new SvelteSet(spellcheckState.customDictionary);
      for (const w of invalidWords) {
        newDict.add(w.toLowerCase());
      }
      spellcheckState.customDictionary = newDict;

      for (const w of invalidWords) {
        spellcheckState.misspelledCache.delete(w.toLowerCase());
      }

      invalidateSpellcheckCache();
      view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
      forceLinting(view);

      void addWordsToDictionary(invalidWords).then(() => {
        spellcheckState.refreshCustomDictionary();
      });

      return true;
    },
  },
];
