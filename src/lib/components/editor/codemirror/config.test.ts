import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { canonicalKey, deleteWordForwardAtLineEnd, toCmKey } from "./config";

function runDelete(doc: string, pos: number) {
  const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: pos } }) });
  const handled = deleteWordForwardAtLineEnd(view);
  const result = { handled, doc: view.state.doc.toString(), head: view.state.selection.main.head };
  view.destroy();
  return result;
}

describe("deleteWordForwardAtLineEnd", () => {
  it("eats the next line's indentation when at the end of a line", () => {
    expect(runDelete("abc\n    def", 3)).toEqual({ handled: true, doc: "abcdef", head: 3 });
  });

  it("keeps CodeMirror's word deletion away from the line end", () => {
    expect(runDelete("abc def", 3)).toEqual({ handled: true, doc: "abc", head: 3 });
  });

  it("does nothing at the end of the last line", () => {
    expect(runDelete("abc", 3)).toEqual({ handled: false, doc: "abc", head: 3 });
  });
});

describe("toCmKey", () => {
  it("maps ctrl and meta to Mod", () => {
    expect(toCmKey("ctrl+b")).toBe("Mod-b");
    expect(toCmKey("meta+k")).toBe("Mod-k");
  });

  it("keeps canonical names for multi-word keys", () => {
    expect(toCmKey("alt+arrowup")).toBe("Alt-ArrowUp");
    expect(toCmKey("ctrl+alt+arrowdown")).toBe("Mod-Alt-ArrowDown");
    expect(toCmKey("ctrl+shift+pagedown")).toBe("Mod-Shift-PageDown");
    expect(toCmKey("ctrl+home")).toBe("Mod-Home");
  });

  it("keeps single characters and function keys", () => {
    expect(toCmKey("ctrl+shift+e")).toBe("Mod-Shift-e");
    expect(toCmKey("f8")).toBe("F8");
    expect(toCmKey("ctrl+space")).toBe("Mod-Space");
  });
});

describe("canonicalKey", () => {
  it("treats modifier order and the Mod alias as equivalent", () => {
    expect(canonicalKey("Mod-Shift-k")).toBe(canonicalKey("Shift-Mod-k"));
    expect(canonicalKey("Alt-Mod-k")).toBe(canonicalKey("Mod-Alt-k"));
  });

  it("keeps different chords apart", () => {
    expect(canonicalKey("Alt-ArrowUp")).not.toBe(canonicalKey("Alt-ArrowDown"));
    expect(canonicalKey("Mod-k")).not.toBe(canonicalKey("Mod-Shift-k"));
  });
});
