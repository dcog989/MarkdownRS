import type { EditorView } from "@codemirror/view";
import { lineToY, type MinimapLayout, minimapLineHeight, yToLine } from "./minimapLayout";

export function handleTrackMouseDown(
  e: MouseEvent,
  view: EditorView,
  canvas: HTMLCanvasElement,
  layout: MinimapLayout,
): void {
  e.preventDefault();

  const sd = view.scrollDOM;
  const doc = view.state.doc;
  const editorView = view;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.height === 0) return;

  // Keep the grabbed point of the viewport rect under the cursor: record where
  // the pointer sits inside the rect (in minimap coordinates) and preserve it
  // while dragging.
  const startTopLine = doc.lineAt(view.lineBlockAtHeight(sd.scrollTop).from).number - 1;
  const grabOffset = e.clientY - canvasRect.top - lineToY(layout, startTopLine);
  const startBottomLine = doc.lineAt(view.lineBlockAtHeight(sd.scrollTop + sd.clientHeight).from).number - 1;
  const viewportHeightPx = lineToY(layout, startBottomLine) + minimapLineHeight(layout) - lineToY(layout, startTopLine);
  let moved = false;

  // Map a source line to its real document offset so the drag matches the line
  // layout that was drawn, not the (estimated, shifting) `scrollHeight`.
  function scrollToLine(line0: number) {
    const safeLine = Math.max(0, Math.min(line0, doc.lines - 1));
    const maxScroll = Math.max(0, sd.scrollHeight - sd.clientHeight);
    const target = editorView.lineBlockAt(doc.line(safeLine + 1).from).top;
    sd.scrollTop = Math.max(0, Math.min(maxScroll, target));
  }

  function onMouseMove(ev: MouseEvent) {
    moved = true;
    const targetTopY = ev.clientY - canvasRect.top - grabOffset;
    scrollToLine(yToLine(layout, targetTopY));
  }

  function onMouseUp(ev: MouseEvent) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";

    if (!moved) {
      const clickY = ev.clientY - canvasRect.top;
      // Snap a click inside the viewport-height band at either edge to the
      // document extremes, so the top/bottom of the minimap are easy to hit.
      let clickedLine: number;
      if (clickY < viewportHeightPx) {
        clickedLine = 0;
      } else if (clickY > canvasRect.height - viewportHeightPx) {
        clickedLine = layout.totalLines - 1;
      } else {
        clickedLine = yToLine(layout, clickY);
      }
      scrollToLine(clickedLine);
    }
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.body.style.userSelect = "none";
}

export function handleWheel(e: WheelEvent, view: EditorView): void {
  e.preventDefault();

  let { deltaY, deltaX } = e;

  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    const lineH = view.defaultLineHeight;
    deltaY *= lineH;
    deltaX *= lineH;
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const pageH = view.scrollDOM.clientHeight;
    deltaY *= pageH;
    deltaX *= pageH;
  }

  view.scrollDOM.scrollBy({ top: deltaY, left: deltaX });
}
