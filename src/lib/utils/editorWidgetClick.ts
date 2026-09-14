import type { PointerAction } from "./renderedPointer";

/**
 * Shared resolver for clicks on rendered markdown widgets (image widgets, table
 * widgets, ...). Finds the widget root via `selector`, resolves a caret anchor
 * from the clicked element, and returns an immediate intercepting action.
 * Returns null when the click is not on the widget so other resolvers (or
 * CodeMirror) can handle it.
 */
export function widgetPointerAction(
  event: MouseEvent,
  selector: string,
  resolveAnchor: (widget: HTMLElement, element: Element) => number | null,
): PointerAction | null {
  const target = event.target as Node | null;
  const element = target instanceof Element ? target : target?.parentElement;
  const widget = element?.closest<HTMLElement>(selector);
  if (!widget || !element) return null;

  const anchor = resolveAnchor(widget, element);
  if (anchor == null) return null;

  return { target: anchor, apply: "now", intercept: true };
}
