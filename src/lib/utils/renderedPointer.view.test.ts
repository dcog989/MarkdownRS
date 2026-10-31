import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type PointerAction, renderedPointerHandler } from "./renderedPointer";

const DOC = "0123456789";
const SNAP_TARGET = 7;
const CARET = 3;
const PRESS = { x: 10, y: 10 };

const originalGetClientRects = Range.prototype.getClientRects;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

function mockLayout() {
  Range.prototype.getClientRects = () =>
    [
      { left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) },
    ] as unknown as DOMRectList;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 800, top: 0, bottom: 20, width: 800, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

function restoreLayout() {
  Range.prototype.getClientRects = originalGetClientRects;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
}

function createView(resolve: () => PointerAction | null) {
  const parent = document.createElement("div");
  parent.style.width = "800px";
  parent.style.height = "600px";
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: DOC,
    selection: { anchor: 0 },
    extensions: [renderedPointerHandler([resolve])],
  });
  return new EditorView({ state, parent });
}

function mouse(view: EditorView, type: "mousedown" | "mouseup") {
  view.contentDOM.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: PRESS.x, clientY: PRESS.y, button: 0 }),
  );
}

/** The fake layout makes CodeMirror's own click select a line; place a caret like a real click would. */
function placeCaret(view: EditorView) {
  view.dispatch({ selection: { anchor: CARET } });
}

describe("renderedPointerHandler", () => {
  beforeEach(mockLayout);
  afterEach(() => {
    restoreLayout();
    document.body.innerHTML = "";
  });

  it("snaps the caret when a press is released inside the editor", () => {
    const view = createView(() => ({ target: SNAP_TARGET, apply: "mouseup" }));

    mouse(view, "mousedown");
    placeCaret(view);
    mouse(view, "mouseup");

    expect(view.state.selection.main.head).toBe(SNAP_TARGET);
    view.destroy();
  });

  it("ignores a target from a press that was released outside the editor", () => {
    let presses = 0;
    // The first press resolves (a masked link); a later press at the same spot
    // no longer does, so the stale target is never overwritten.
    const view = createView(() => (presses++ === 0 ? { target: SNAP_TARGET, apply: "mouseup" } : null));

    mouse(view, "mousedown");
    placeCaret(view);
    mouse(view, "mousedown");
    placeCaret(view);
    mouse(view, "mouseup");

    expect(view.state.selection.main.head).toBe(CARET);
    view.destroy();
  });

  it("drops the target when the editor loses focus", () => {
    const view = createView(() => ({ target: SNAP_TARGET, apply: "mouseup" }));

    mouse(view, "mousedown");
    placeCaret(view);
    view.contentDOM.dispatchEvent(new FocusEvent("blur"));
    mouse(view, "mouseup");

    expect(view.state.selection.main.head).toBe(CARET);
    view.destroy();
  });

  it("drops the target when a key is pressed", () => {
    const view = createView(() => ({ target: SNAP_TARGET, apply: "mouseup" }));

    mouse(view, "mousedown");
    placeCaret(view);
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    mouse(view, "mouseup");

    expect(view.state.selection.main.head).toBe(CARET);
    view.destroy();
  });
});
