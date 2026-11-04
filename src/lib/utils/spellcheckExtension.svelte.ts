import type { EditorView } from "@codemirror/view";
import { SPELLCHECK_WORD_PATTERN, spellcheckState } from "$lib/utils/spellcheck.svelte";
import { createSpellCheckLinter, triggerImmediateLint } from "./spellcheckLinter";

export { createSpellCheckLinter, triggerImmediateLint };

export function invalidateSpellcheckCache() {
  spellcheckState.validCache.clear();
  spellcheckState.misspelledCache.clear();
}

function addWordsUnderCursor(view: EditorView): boolean {
  const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  let words: string[] = [];

  if (selection && selection.trim().length > 0) {
    words = selection.match(SPELLCHECK_WORD_PATTERN) ?? [];
  } else {
    const range = view.state.wordAt(view.state.selection.main.head);
    if (range) {
      words = view.state.sliceDoc(range.from, range.to).match(SPELLCHECK_WORD_PATTERN) ?? [];
    }
  }

  // Only add words that are not already valid, matching the context-menu
  // "Add to Dictionary" semantics, and batch them into a single backend call.
  const invalidWords = words.filter((w) => w.length > 1 && !spellcheckState.isWordValid(w));
  if (invalidWords.length === 0) return true;

  void spellcheckState.addWords(invalidWords).then((saved) => {
    // The optimistic update is reverted on failure; re-lint so the markers
    // match the dictionary on disk again.
    if (!saved) triggerImmediateLint(view);
  });
  triggerImmediateLint(view);

  return true;
}

// HIG: a function key never stands alone, so Ctrl+F8 mirrors F8.
export const spellCheckKeymap = [
  { key: "F8", run: addWordsUnderCursor },
  { key: "Ctrl-F8", run: addWordsUnderCursor },
];
