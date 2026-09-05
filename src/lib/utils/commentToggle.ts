import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function toggleSelectionComment(view: EditorView): boolean {
  const result = view.state.changeByRange((range) => {
    const { from, to } = range;

    if (from !== to) {
      const selectedText = view.state.sliceDoc(from, to);
      const isCommented = selectedText.startsWith("<!-- ") && selectedText.endsWith(" -->") && selectedText.length > 9;

      if (isCommented) {
        const uncommented = selectedText.slice(5, -4);
        return {
          range: EditorSelection.range(from, from + uncommented.length),
          changes: { from, to, insert: uncommented },
        };
      }

      return {
        range: EditorSelection.range(from, from + selectedText.length + 9),
        changes: { from, to, insert: `<!-- ${selectedText} -->` },
      };
    }

    const line = view.state.doc.lineAt(from);
    const leadingSpace = line.text.match(/^(\s*)/)?.[1] || "";
    const content = line.text.slice(leadingSpace.length);

    if (!content) {
      return { range, changes: [] };
    }

    const isCommented = content.startsWith("<!--") && content.endsWith("-->");

    if (isCommented) {
      let uncommented: string;
      if (content.startsWith("<!-- ") && content.endsWith(" -->")) {
        uncommented = content.slice(5, -4);
      } else {
        uncommented = content.slice(4, -3).trim();
      }
      return {
        range: EditorSelection.cursor(line.from + leadingSpace.length),
        changes: { from: line.from, to: line.to, insert: leadingSpace + uncommented },
      };
    }

    return {
      range: EditorSelection.cursor(line.from + leadingSpace.length),
      changes: { from: line.from, to: line.to, insert: `${leadingSpace}<!-- ${content} -->` },
    };
  });

  view.dispatch({ ...result, scrollIntoView: true });
  return true;
}
