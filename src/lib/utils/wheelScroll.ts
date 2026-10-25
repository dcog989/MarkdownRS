/* Used when a scroll surface has no line height of its own (overlay tracks,
 * non-editor panels): wheel deltas in line mode are rare and small either way. */
const DEFAULT_LINE_HEIGHT = 16;

/** Forwards a wheel delta to a scroll container, normalizing line/page modes. */
export function scrollByWheel(e: WheelEvent, el: HTMLElement, lineHeight = DEFAULT_LINE_HEIGHT): void {
  e.preventDefault();

  let { deltaY, deltaX } = e;

  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    deltaY *= lineHeight;
    deltaX *= lineHeight;
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const pageHeight = el.clientHeight;
    deltaY *= pageHeight;
    deltaX *= pageHeight;
  }

  el.scrollBy({ top: deltaY, left: deltaX });
}
