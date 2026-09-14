import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** How a resolved pointer action should be applied to the selection. */
export type PointerApply =
  /** Immediately, in the mousedown handler. */
  | "now"
  /** On mouseup, if the press did not become a drag. */
  | "mouseup"
  /** In a microtask: after CodeMirror's own selection, before the next paint. */
  | "microtask";

export interface PointerAction {
  /** Document offset to place the caret at. */
  target: number;
  /** Cursor associativity. Defaults to 0, except `"microtask"` which defaults to -1. */
  assoc?: number;
  apply: PointerApply;
  /** Prevent CodeMirror from handling the mousedown (used by widget clicks). */
  intercept?: boolean;
  /** Offset CodeMirror would select on its own; the microtask only applies if it matches. */
  expectedHead?: number;
}

/** Maps a rendered-mode mousedown to a caret correction, or null to defer to CodeMirror. */
export type PointerResolver = (view: EditorView, event: MouseEvent) => PointerAction | null;

interface PendingMouseup {
  target: number;
  assoc: number;
  x: number;
  y: number;
}

/**
 * Single mousedown/mouseup handler for click-to-caret corrections in rendered
 * mode. Resolvers are tried in order and the first match wins.
 *
 * The three application modes exist for concrete reasons:
 * - `"now"` (widget clicks) owns the event and stops CodeMirror.
 * - `"mouseup"` (masked-URL boundaries) leaves mousedown to CodeMirror so a drag
 *   can start, and only snaps a plain click.
 * - `"microtask"` (soft-wrap boundaries) runs after CodeMirror's selection but
 *   before paint, so the reveal of the construct is never rendered.
 */
export function renderedPointerHandler(resolvers: readonly PointerResolver[]): Extension {
  const pendingMouseup = new WeakMap<EditorView, PendingMouseup>();

  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (event.button !== 0) return false;

      for (const resolve of resolvers) {
        const action = resolve(view, event);
        if (!action) continue;

        if (action.apply === "now") {
          if (action.intercept) {
            event.preventDefault();
            view.focus();
          }
          view.dispatch({
            selection: EditorSelection.cursor(action.target, action.assoc ?? 0),
            scrollIntoView: false,
          });
          return action.intercept ?? false;
        }

        if (action.apply === "microtask") {
          const expectedHead = action.expectedHead ?? action.target;
          const { target } = action;
          const assoc = action.assoc ?? -1;
          queueMicrotask(() => {
            const sel = view.state.selection.main;
            if (sel.empty && sel.head === expectedHead) {
              view.dispatch({ selection: EditorSelection.cursor(target, assoc), scrollIntoView: false });
            }
          });
          return false;
        }

        pendingMouseup.set(view, {
          target: action.target,
          assoc: action.assoc ?? 0,
          x: event.clientX,
          y: event.clientY,
        });
        return false;
      }

      return false;
    },

    mouseup: (event, view) => {
      const pending = pendingMouseup.get(view);
      if (!pending) return false;
      pendingMouseup.delete(view);
      if (!view.state.selection.main.empty) return false;
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 10) return false;
      view.dispatch({
        selection: EditorSelection.cursor(pending.target, pending.assoc),
        scrollIntoView: false,
      });
      return true;
    },
  });
}
