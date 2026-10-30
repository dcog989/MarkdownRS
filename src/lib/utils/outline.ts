import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface OutlineHeading {
  level: number;
  text: string;
  from: number;
}

const ATX_HEADING_RE = /^ATXHeading([1-6])$/;
const LEADING_MARKERS_RE = /^\s*#{1,6}\s*/;
const TRAILING_MARKERS_RE = /\s*#+\s*$/;

/** Headings from the editor's own parser, so the outline exists with the preview closed. */
export function collectOutlineHeadings(state: EditorState): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const doc = state.doc;

  syntaxTree(state).iterate({
    enter: (node) => {
      const match = ATX_HEADING_RE.exec(node.name);
      if (!match) return;
      const text = doc.sliceString(node.from, node.to).replace(LEADING_MARKERS_RE, "").replace(TRAILING_MARKERS_RE, "");
      headings.push({ level: Number(match[1]), text, from: node.from });
      return false;
    },
  });

  return headings;
}

export function jumpToHeading(view: EditorView, from: number): void {
  view.dispatch({
    selection: { anchor: from },
    effects: EditorView.scrollIntoView(from, { y: "start", yMargin: 24 }),
  });
  view.focus();
}
