import {
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { autocompleteEmojis } from "$lib/config/emojiData";

/** True when the character immediately before `pos` is a word char. */
function isPrecededByWordChar(state: EditorState, pos: number): boolean {
  const preceding = state.sliceDoc(pos - 1, pos);
  return Boolean(preceding && /\w/.test(preceding));
}

/** GitHub-style `:shortcode:` trigger followed by an (incomplete) code. */
const SHORTCODE_MATCH = /:[a-zA-Z0-9_+-]{0,64}/;

// Opening the picker on a bare `:` pops it on every prose colon. Require one
// shortcode character before offering a list.
const MIN_SHORTCODE_QUERY_LENGTH = 1;
const EMOJI_TRIGGER = /:([a-zA-Z0-9_+-]{1,64})$/;

function buildResult(from: number, query: string): CompletionResult | null {
  if (query.length < MIN_SHORTCODE_QUERY_LENGTH) return null;

  const options = autocompleteEmojis(query).map((entry) => ({
    label: entry.char,
    detail: `:${entry.shortcode}:`,
    type: "emoji",
    apply: entry.char,
  }));

  return {
    from,
    // `to` intentionally omitted: CodeMirror defaults it to the cursor
    // position, so the apply replaces exactly the typed `:shortcode`.
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
  if (isPrecededByWordChar(context.state, before.from)) return null;

  return buildResult(before.from, before.text.slice(1));
}

/**
 * Opens emoji completion as soon as one shortcode character follows `:`,
 * bypassing the global autocomplete typing delay without intercepting the
 * colon itself.
 */
export const emojiCompletionTrigger = EditorView.updateListener.of((update) => {
  if (!update.docChanged || update.view.composing || completionStatus(update.state) === "active") return;

  const { head, empty } = update.state.selection.main;
  if (!empty) return;

  const line = update.state.doc.lineAt(head);
  const match = EMOJI_TRIGGER.exec(line.text.slice(0, head - line.from));
  if (!match) return;

  const colonPos = head - match[0].length;
  if (isPrecededByWordChar(update.state, colonPos)) return;

  // Don't start the picker just to let the generic word source answer.
  if (autocompleteEmojis(match[1]).length === 0) return;

  startCompletion(update.view);
});
