import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface CodeBlockCopyDeps {
  translate: (key: string) => string;
  showToast: (type: "info" | "success" | "warning" | "error", message: string) => void;
}

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
