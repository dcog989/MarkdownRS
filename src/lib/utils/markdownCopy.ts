import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface CodeBlockCopyDeps {
  translate: (key: string) => string;
  showToast: (type: "info" | "success" | "warning" | "error", message: string) => void;
}

const COPY_SNAP_NODES = new Set(["Emphasis", "StrongEmphasis", "Link", "Image", "InlineCode"]);

/**
 * Expands a selection to cover any inline Markdown construct it partially
 * touches, so copying always yields the full raw source (e.g. `**bold**`
 * instead of `bold` or a half-marker fragment) regardless of how the painted
 * selection edges align with the underlying document.
 */
export function snapToMarkdownConstruct(view: EditorView, from: number, to: number): { from: number; to: number } {
  let snapFrom = from;
  let snapTo = to;
  syntaxTree(view.state).iterate({
    from,
    to,
    enter: (node) => {
      if (!COPY_SNAP_NODES.has(node.name)) return;
      // Selecting text fully inside a construct that renders as literal content
      // copies only that fragment. The markers are visible while the selection
      // exists, so snapping would drag unseen delimiters (inline-code ticks) or
      // the whole `![alt](url)` into the clipboard.
      if ((node.name === "InlineCode" || node.name === "Image") && node.from < from && to < node.to) return;
      if (node.from < from || node.to > to) {
        snapFrom = Math.min(snapFrom, node.from);
        snapTo = Math.max(snapTo, node.to);
      }
    },
  });
  return { from: snapFrom, to: snapTo };
}

export const renderedCopyHandler = EditorView.domEventHandlers({
  copy: (event, view) => {
    const selection = view.state.selection.main;
    if (selection.empty) return false;
    const { from, to } = snapToMarkdownConstruct(view, selection.from, selection.to);
    event.preventDefault();
    navigator.clipboard.writeText(view.state.sliceDoc(from, to));
    return true;
  },
});

export function createCodeBlockCopyHandler(deps: CodeBlockCopyDeps): Extension {
  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains("cm-code-info")) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const tree = syntaxTree(view.state);
      let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, 1);
      while (node && node.name !== "FencedCode") {
        node = node.parent;
      }
      if (!node) return false;

      const fencedNode = node;

      const doc = view.state.doc;
      const startLine = doc.lineAt(fencedNode.from);
      const endLine = doc.lineAt(fencedNode.to);

      let codeEnd = fencedNode.to;
      if (endLine.number > startLine.number && /^```\s*$/.test(endLine.text)) {
        codeEnd = endLine.from;
      }

      const code = doc.sliceString(startLine.to + 1, codeEnd).replace(/\n$/, "");
      navigator.clipboard.writeText(code).then(() => deps.showToast("success", deps.translate("preview.codeCopied")));

      return true;
    },
  });
}
