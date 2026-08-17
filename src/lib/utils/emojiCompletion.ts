import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { startCompletion } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { autocompleteEmojis } from '$lib/config/emojiData';

/** GitHub-style `:shortcode:` trigger followed by an (incomplete) code. */
const SHORTCODE_MATCH = /:[a-zA-Z0-9_+-]{0,32}/;

function buildResult(from: number, query: string): CompletionResult {
  const options = autocompleteEmojis(query).map((entry) => ({
    label: entry.char,
    detail: `:${entry.shortcode}:`,
    type: 'emoji',
    apply: entry.char,
  }));

  return {
    from,
    options,
    // CodeMirror's default filter matches the typed text against the option
    // label, which can't work for emoji glyphs. Disable it.
    filter: false,
    // Refilter synchronously on each keystroke instead of re-querying the
    // source (which would wait on the global typing delay).
    update: (_, __, ___, context) => {
      const before = context.matchBefore(SHORTCODE_MATCH);
      if (!before) return null;
      return buildResult(before.from, before.text.slice(1));
    },
  };
}

export function emojiCompletion(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(SHORTCODE_MATCH);
  if (!before) return null;

  // Don't trigger mid-word (e.g. `hello:world` or `12:30`): the colon should
  // follow whitespace, punctuation, or the start of the line.
  const preceding = context.state.sliceDoc(before.from - 1, before.from);
  if (preceding && /\w/.test(preceding)) return null;

  return buildResult(before.from, before.text.slice(1));
}

/**
 * Opens the emoji completion the moment `:` is typed, bypassing the global
 * autocomplete typing delay (~instant instead of 850ms).
 */
export const emojiAutocompleteKeymap = keymap.of([
  {
    key: ':',
    run: (view) => {
      if (view.composing) return false;
      const sel = view.state.selection.main;
      if (sel.from !== sel.head) return false;
      view.dispatch({
        changes: { from: sel.head, insert: ':' },
        selection: { anchor: sel.head + 1 },
        userEvent: 'input.type',
      });
      startCompletion(view);
      return true;
    },
  },
]);
