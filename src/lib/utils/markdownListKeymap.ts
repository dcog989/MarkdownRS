import { syntaxTree } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";
import { isVisibleInCodeBlock } from "./markdownDecorationCore";

/**
 * In rendered mode, Backspace on an empty list line (e.g. the `- ` item
 * auto-created by Enter) should reveal the raw marker on the first press and
 * remove it on the second, instead of lang-markdown's default of blanking the
 * whole marker into invisible spaces on the first press.
 */
function listMarkerBackspace(view: EditorView): boolean {
  const { state } = view;
  const { head, empty } = state.selection.main;
  if (!empty || head === 0) return false;
  const line = state.doc.lineAt(head);
  if (head !== line.to) return false;
  // Code-block content is never a WYSIWYG list item; leave Backspace to the
  // default handler so the literal `- ` text is edited normally.
  if (isVisibleInCodeBlock(syntaxTree(state), line.from)) return false;

  const match = /^(\s*)-\s?$/.exec(line.text);
  if (!match) return false;

  const dashStart = line.from + match[1].length;
  const dashEnd = dashStart + 1;
  const hasTrailingSpace = dashEnd < line.to;

  view.dispatch({
    changes: hasTrailingSpace ? { from: dashEnd, to: line.to } : { from: dashStart, to: dashEnd },
    selection: { anchor: hasTrailingSpace ? dashEnd : dashStart },
  });
  return true;
}

export const renderedModeKeymap = Prec.highest(keymap.of([{ key: "Backspace", run: listMarkerBackspace }]));
