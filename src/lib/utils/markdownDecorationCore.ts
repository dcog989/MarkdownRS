import type { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import type { Decoration, EditorView } from "@codemirror/view";

/** Resolves the base directory of the tab a view belongs to (for image sources). */
export type GetTabDirectory = (view: EditorView) => string;

/** Callout markers and the line numbers they style. */
export interface CalloutInfo {
  markers: { from: number; to: number; kind: string; active: boolean }[];
  lines: Map<number, string>;
}

/**
 * Shared state threaded through the single decoration pass. Each per-construct
 * collector reads/writes only its own slice, keeping buildDecorations a thin
 * orchestrator over one tree walk and one line walk.
 */
export interface DecorationWalk {
  view: EditorView;
  tree: ReturnType<typeof syntaxTree>;
  ranges: Range<Decoration>[];
  getTabDirectory: GetTabDirectory;
  calloutMarkers: CalloutInfo["markers"];
  calloutLines: CalloutInfo["lines"];
  tableSpans: Array<{ from: number; to: number }>;
  cursorHeadingLines: Set<number>;
  tableLines: Set<number>;
  frontmatterLines: Set<number>;
  codeBlockLines: Set<number>;
  parserHrs: Set<number>;
  blockquoteLines: Set<number>;
}

/**
 * Reveals (paints raw) a node when the caret sits inside it, at either edge, or
 * when any selection range overlaps it. Range overlap keeps a node unpainted
 * while the user drags a selection through it or edits with multiple carets.
 * Including both edges means the raw markers stay visible the moment the caret
 * stops right before or right after a construct (e.g. `*Italics*`), matching
 * WYSIWYG editing expectations.
 */
export function isRevealed(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => {
    if (r.from !== r.to) return r.from < to && r.to > from;
    const caret = r.from;
    return caret >= from && caret <= to;
  });
}

/**
 * Horizontal rules are their own line, so any caret on the line (edges
 * included) keeps the rule visible as raw text instead of flipping it under
 * the caret. Uses the node's block span, not a nested inline construct.
 */
export function isHrLineRevealed(view: EditorView, lineFrom: number, lineTo: number): boolean {
  return view.state.selection.ranges.some((r) =>
    r.from === r.to ? r.from >= lineFrom && r.from <= lineTo : r.from < lineTo && r.to > lineFrom,
  );
}

export function isVisibleInCodeBlock(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  const node = tree.resolveInner(pos, 1);
  // Fenced code content resolves to CodeText (child of FencedCode); CodeBlock is
  // indented code, and InlineCode covers inline backtick spans.
  return (
    node.name === "FencedCode" || node.name === "CodeText" || node.name === "CodeBlock" || node.name === "InlineCode"
  );
}
