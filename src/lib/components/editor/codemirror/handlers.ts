import { startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { armFenceLanguagePicker } from "$lib/utils/fenceLanguageCompletion";
import { spellcheckState } from "$lib/utils/spellcheck.svelte";

function getWhitespaceState(state: EditorView["state"], pos: number): { isBefore: boolean; isAfter: boolean } {
  const charBefore = pos > 0 ? state.sliceDoc(pos - 1, pos) : "";
  const isWhitespaceBefore = pos === 0 || /\s/.test(charBefore);

  const charAfter = pos < state.doc.length ? state.sliceDoc(pos, pos + 1) : "";
  const isWhitespaceAfter = pos === state.doc.length || /\s/.test(charAfter);

  return { isBefore: isWhitespaceBefore, isAfter: isWhitespaceAfter };
}

/**
 * Handles smart backtick insertion for code blocks.
 * Only auto-completes backticks if there's whitespace or start/end of line before/after.
 */
export const smartBacktickHandler = EditorView.inputHandler.of((view, from, to, text) => {
  if (text === "`" && from === to) {
    const state = view.state;
    const before = state.sliceDoc(Math.max(0, from - 2), from);
    const after = state.sliceDoc(from, from + 1);

    // Skip over closing backtick if it exists
    if (after === "`" && state.sliceDoc(Math.max(0, from - 1), from) === "`") {
      view.dispatch({ selection: { anchor: from + 1 } });
      return true;
    }

    // Handle triple backtick expansion
    if (before === "``") {
      const line = state.doc.lineAt(from);
      const textBefore = line.text.slice(0, from - line.from - 2);
      const charAfter = from < state.doc.length ? state.sliceDoc(from, from + 1) : "";

      if (/^\s*$/.test(textBefore) && (charAfter === "" || /\s/.test(charAfter))) {
        const indent = textBefore;
        const blockStart = from + 2 + indent.length;
        // When the language picker is available, park the cursor right after
        // the opening fence and offer a language selection; otherwise drop
        // straight into the block as before.
        const armed = armFenceLanguagePicker(view, line.number);
        view.dispatch({
          changes: {
            from,
            to,
            insert: `\`\n${indent}\n${indent}\`\`\``,
          },
          selection: { anchor: armed ? from + 1 : blockStart },
          scrollIntoView: true,
        });
        if (armed) startCompletion(view);
        return true;
      }
    }

    const { isBefore, isAfter } = getWhitespaceState(state, from);

    // Only auto-close if there's whitespace or document boundary on both sides
    if (isBefore && isAfter) {
      view.dispatch({
        changes: { from, to, insert: "``" },
        selection: { anchor: from + 1 },
      });
      return true;
    }
  }
  return false;
});

export const prefetchHoverHandler = EditorView.domEventHandlers({
  mousemove: (event, view) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const range = view.state.wordAt(pos);
    if (range) {
      const word = view.state.sliceDoc(range.from, range.to);
      spellcheckState.prefetchSuggestions(word);
    }
    return false;
  },
});
