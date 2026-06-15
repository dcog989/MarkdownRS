import { forceLinting } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { SvelteSet } from 'svelte/reactivity';
import { addToDictionary } from '$lib/utils/fileSystem';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';
import { invalidateSpellcheckCache, tabCache } from './spellcheckCache';
import {
  applyImmediateSpellcheck,
  createSpellCheckLinter,
  spellcheckRefreshEffect,
  triggerImmediateLint,
} from './spellcheckLinter';

export { applyImmediateSpellcheck, createSpellCheckLinter, invalidateSpellcheckCache, triggerImmediateLint };

export async function refreshSpellcheck(view: EditorView | undefined) {
  if (!view) return;

  tabCache.invalidateAll();

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

      if (words.length > 0) {
        const newDict = new SvelteSet(spellcheckState.customDictionary);
        for (const w of words) {
          if (w && w.length > 1) {
            newDict.add(w.toLowerCase());
          }
        }
        spellcheckState.customDictionary = newDict;

        for (const w of words) {
          spellcheckState.misspelledCache.delete(w.toLowerCase());
        }

        tabCache.invalidateAll();
        view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
        forceLinting(view);

        Promise.all(words.map((w) => addToDictionary(w))).then(() => {
          spellcheckState.refreshCustomDictionary();
        });
      }
      return true;
    },
  },
];
