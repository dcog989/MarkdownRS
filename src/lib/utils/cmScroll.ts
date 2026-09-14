import { ensureSyntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { CONFIG } from "$lib/utils/config";

/** A saved position at or above this fraction of the scroll range is treated as
 *  "at the bottom" for the bottom-aligned scroll restore. */
const AT_BOTTOM_PERCENTAGE_THRESHOLD = 0.99;

/**
 * Restore a saved scroll position by anchoring to a saved top line (robust
 * across content/wrap changes), falling back to a saved pixel offset. When
 * there is no saved position, restores to the top: the scroll DOM survives
 * `setState`, so leaving it untouched on a tab switch would inherit the
 * previous tab's deep scroll offset.
 *
 * Applies synchronously so it can run inside an existing `requestMeasure`
 * write (or `requestAnimationFrame`) without scheduling an extra measure
 * cycle; deferring it would let the new document paint one frame at scroll
 * top, with the deep viewport still unparsed and unstyled.
 */
export function restoreScrollByTopLine(
  view: EditorView,
  topLine: number,
  scrollTop: number,
  scrollPercentage = 0,
): void {
  if (!view.scrollDOM) return;

  const safeLine = Math.max(1, Math.min(topLine, view.state.doc.lines));

  // Parse the visible fold (plus a full extra viewport) before scrolling so
  // the restored viewport is already parsed and decorated on its first paint.
  // Rendered-mode widgets (tables, images, headings) replace multi-line raw
  // constructs with shorter elements, so more source lines fit per pixel than
  // a fixed line-height estimate suggests; use the measured default line
  // height and over-cover rather than underestimate. ensureSyntaxTree keeps
  // parsing in the background if the budget expires, so the highlight still
  // lands shortly after on very large docs.
  const lineHeight = view.defaultLineHeight || 21;
  const linesPerViewport = Math.ceil((view.scrollDOM.clientHeight || 600) / lineHeight);
  const extendTo = Math.min(view.state.doc.lines, safeLine + linesPerViewport * 2);
  const parseUpto = view.state.doc.line(extendTo).to;
  ensureSyntaxTree(view.state, parseUpto, CONFIG.PERFORMANCE.SCROLL_RESTORE_PARSE_TIMEOUT_MS);

  if (topLine > 1) {
    try {
      // `topLine` is the line the saved scrollTop cut through; anchoring it to
      // the viewport top shifts the content up by that partial line. At the
      // bottom of the document the last line then falls out of view (there is
      // no content below to absorb the shift), so align the last line with the
      // viewport bottom instead of the top line.
      //
      // Deciding "at the bottom" from the saved scroll percentage (rather than
      // an estimated lines-per-viewport against the source line count) is the
      // reliable signal: per-line heights vary with wrapping and rendered
      // widgets, so `defaultLineHeight`-based estimates misfire and would
      // bottom-align ordinary mid-document scrolls.
      if (scrollPercentage >= AT_BOTTOM_PERCENTAGE_THRESHOLD) {
        const lastLine = view.state.doc.line(view.state.doc.lines);
        view.dispatch({ effects: EditorView.scrollIntoView(lastLine.from, { y: "end" }) });
        return;
      }
      const lineInfo = view.state.doc.line(safeLine);
      view.dispatch({ effects: EditorView.scrollIntoView(lineInfo.from, { y: "start" }) });
      return;
    } catch {
      // Fall through to pixel offset.
    }
  }
  view.scrollDOM.scrollTop = scrollTop;
}
