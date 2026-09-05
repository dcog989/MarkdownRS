// State
export const tooltipStore = $state({
  visible: false,
  content: "",
  x: 0,
  y: 0,
});

let lastCursorX: number | null = null;
let lastCursorY: number | null = null;

// Logic
export function showTooltip(content: string, x: number, y: number) {
  tooltipStore.content = content;
  tooltipStore.x = x;
  tooltipStore.y = y;
  tooltipStore.visible = true;
}

export function hideTooltip() {
  tooltipStore.visible = false;
}

export function setCursorPosition(x: number, y: number) {
  lastCursorX = x;
  lastCursorY = y;
}

/**
 * Cleans up JS-driven hover state (open tooltips, peek edge, minimap) after the
 * cursor leaves the window. WebKitGTK doesn't dispatch mouseout/mouseleave on a
 * fast exit, leaving that state stuck. Fired from the native window-cursor-left
 * event; dispatching a synthetic mouseleave to the stale :hover chain lets each
 * element's own handler clean up. CSS-only :hover can't be cleared this way, so
 * such elements must be JS-state driven.
 */
export function clearStuckHoverState() {
  hideTooltip();

  const hovered = document.querySelectorAll<HTMLElement>(":hover");
  for (const el of hovered) {
    el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: null }));
  }
}

/**
 * Re-activates hover state for the element under the cursor after the window
 * is re-entered. WebKitGTK skips the initial mouseenter for that element, so
 * it stays inactive until the cursor moves. GTK's enter-notify gives the
 * cursor position in viewport coordinates, matching the CSS clientX/clientY
 * space.
 */
export function activateHoverAtPoint(x: number, y: number) {
  setCursorPosition(x, y);
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  for (let node: Element | null = el; node; node = node.parentElement) {
    node.dispatchEvent(
      new MouseEvent("mouseenter", {
        bubbles: false,
        cancelable: true,
        relatedTarget: null,
        clientX: x,
        clientY: y,
      }),
    );
    if (node === document.documentElement) break;
  }
}

export function getCursorPosition(): { x: number | null; y: number | null } {
  return { x: lastCursorX, y: lastCursorY };
}
