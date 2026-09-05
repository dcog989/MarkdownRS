import type { EditorView } from "@codemirror/view";

/**
 * Shared handling for clicks on rendered markdown widget chrome (image widgets,
 * table widgets, ...). Resolves the DOM element under the pointer, finds the
 * widget root via `selector`, resolves a caret anchor, and places the selection.
 * Returns false when the click is not on the widget so CodeMirror handles it.
 */
export function handleWidgetClick(
  view: EditorView,
  event: MouseEvent,
  selector: string,
  resolveAnchor: (widget: HTMLElement, element: Element) => number | null,
): boolean {
  const target = event.target as Node | null;
  const element = target instanceof Element ? target : target?.parentElement;
  const widget = element?.closest<HTMLElement>(selector);
  if (!widget || !element) return false;

  const anchor = resolveAnchor(widget, element);
  if (anchor == null) return false;

  event.preventDefault();
  view.focus();
  view.dispatch({ selection: { anchor }, scrollIntoView: false });
  return true;
}
