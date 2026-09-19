import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { PointerResolver } from "./renderedPointer";

/**
 * Returns the caret position a click on a masked link should land at, or null
 * when the click is not on a masked URL region.
 */
function maskedLinkClickTarget(view: EditorView, pos: number): number | null {
  const doc = view.state.doc;
  const cursor = view.state.selection.main.head;
  const line = doc.lineAt(pos);
  let target: number | null = null;

  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter: (node) => {
      if (target != null) return;
      if (node.name === "Autolink") {
        if (cursor > node.from && cursor < node.to) return;
        const linkMarks = node.node.getChildren("LinkMark");
        const maskStart = linkMarks[linkMarks.length - 1]?.from ?? node.to;
        if (pos >= maskStart && pos <= node.to) target = node.to;
        return;
      }
      if (node.name !== "Link") return;
      const urlNode = node.node.getChild("URL");
      if (!urlNode) return;
      if (cursor > node.from && cursor < node.to) return;
      const linkMarks = node.node.getChildren("LinkMark");
      const textEnd = linkMarks[1]?.from ?? urlNode.from;
      const after = doc.sliceString(urlNode.to, urlNode.to + 1);
      const hideEnd = after === ")" ? urlNode.to + 1 : urlNode.to;
      if (pos >= textEnd && pos < hideEnd) target = hideEnd;
    },
  });

  return target;
}

/**
 * Clicking a masked URL region should place the caret at a sensible spot, but
 * must not swallow mousedown so that drag-selections starting on the URL (e.g.
 * an autolink closing a line) still work. Deferring to mouseup lets the core
 * mouse-selection drive any real drag in between.
 */
export const maskedLinkPointer: PointerResolver = (view, event) => {
  if (event.shiftKey) return null;
  const pos = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
  if (pos == null) return null;
  const target = maskedLinkClickTarget(view, pos.pos);
  return target == null ? null : { target, apply: "mouseup" };
};

const MASKED_MARKER_NODES = new Set(["CodeMark", "EmphasisMark", "LinkMark", "HeaderMark", "QuoteMark"]);

/**
 * A rendered inline marker (e.g. the opening backtick of an inline code span)
 * often sits at the start of a soft-wrapped visual row. Its zero-width replace
 * widget makes `posAtCoords` resolve a click just past it, onto the next row.
 * Returns the end of the pointer's visual row (before the wrapping whitespace
 * and any masked markers) so the caret stays on the row that was clicked.
 */
function wrappedLineEnd(view: EditorView, pos: number, clientY: number): number | null {
  if (pos === 0) return null;

  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  const line = doc.lineAt(pos);

  // Forward correction: the click landed on the start of a masked marker that
  // closes out its logical line (e.g. the closing backtick of an inline code
  // span at the end of a list item). The zero-width replace widget maps the
  // click to the marker's start instead of past it, so snap the caret forward
  // to just after the marker.
  const atMarker = tree.resolveInner(pos, 1);
  if (MASKED_MARKER_NODES.has(atMarker.name) && atMarker.from === pos && atMarker.to === line.to) {
    return atMarker.to;
  }

  // Backward correction: the caret resolved just past a zero-width masked
  // marker, i.e. the marker starts immediately before it.
  const marker = tree.resolveInner(pos - 1, 1);
  if (!MASKED_MARKER_NODES.has(marker.name) || marker.to !== pos) return null;

  // A marker that closes out its logical line cannot be an opening marker at
  // the start of a wrapped row; a click past it already lands after the
  // construct, so there is nothing to correct.
  if (marker.to === line.to) return null;

  // ...and the position it resolved to is on a row below the pointer.
  const after = view.coordsAtPos(pos, 1);
  if (!after || clientY >= after.top) return null;

  // A caret on a later logical line can only be reached by crossing one line
  // break while searching the clicked row.
  const crossNewline = pos === line.from;
  let crossed = false;
  let target = pos;
  while (target > 0) {
    const prev = doc.sliceString(target - 1, target);
    if (prev === "\n") {
      if (!crossNewline || crossed) break;
      crossed = true;
      target--;
      continue;
    }
    if (/[ \t]/.test(prev)) {
      target--;
      continue;
    }
    // Side 1 so the marker node that starts at this offset is returned.
    const node = tree.resolveInner(target - 1, 1);
    if (MASKED_MARKER_NODES.has(node.name) && node.to === target) {
      target = node.from;
      continue;
    }
    break;
  }
  if (target === pos) return null;
  // Reached the start of the logical line without crossing its break: the row
  // above is on the previous logical line, which this click should not enter.
  if (!crossNewline && target === line.from) return null;
  return target;
}

/**
 * Clicking just past a masked marker that begins a wrapped row puts the caret
 * on the next row and reveals the marker. The microtask runs after CodeMirror
 * has applied its own selection but before the browser paints, so the reveal is
 * never shown, and a following drag simply overrides it.
 */
export const wrapBoundaryPointer: PointerResolver = (view, event) => {
  if (event.shiftKey || event.ctrlKey || event.metaKey) return null;
  const hit = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
  if (hit == null) return null;
  const target = wrappedLineEnd(view, hit.pos, event.clientY);
  return target == null ? null : { target, assoc: -1, apply: "microtask", expectedHead: hit.pos };
};
