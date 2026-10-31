import type { EditorView } from "@codemirror/view";
import { lineToY, type MinimapLayout, minimapLineHeight, yToLine } from "./minimapLayout";

export function handleTrackPointerDown(
  e: PointerEvent,
  view: EditorView,
  canvas: HTMLCanvasElement,
  layout: MinimapLayout,
): (() => void) | null {
  e.preventDefault();

  const sd = view.scrollDOM;
  const doc = view.state.doc;
  const editorView = view;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.height === 0) return null;

  // Capture the pointer: a release outside the window delivers no mouseup on
  // the document, which would otherwise leave the drag live and the body's
  // user-select disabled.
  const target = e.currentTarget;
  if (!(target instanceof HTMLElement)) return null;
  // Explicit type: narrowing does not survive into the drag closures.
  const dragTarget: HTMLElement = target;
  dragTarget.setPointerCapture(e.pointerId);

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

  function onPointerMove(ev: PointerEvent) {
    moved = true;
    const targetTopY = ev.clientY - canvasRect.top - grabOffset;
    scrollToLine(yToLine(layout, targetTopY));
  }

  function endDrag() {
    dragTarget.removeEventListener("pointermove", onPointerMove);
    dragTarget.removeEventListener("pointerup", onPointerUp);
    dragTarget.removeEventListener("pointercancel", endDrag);
    if (dragTarget.hasPointerCapture(e.pointerId)) dragTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
  }

  function onPointerUp(ev: PointerEvent) {
    endDrag();

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

  dragTarget.addEventListener("pointermove", onPointerMove);
  dragTarget.addEventListener("pointerup", onPointerUp);
  dragTarget.addEventListener("pointercancel", endDrag);
  document.body.style.userSelect = "none";

  // Returned so the caller can release the drag on unmount; pointerup only
  // covers the normal path.
  return endDrag;
}
