import { describe, expect, it } from "vitest";
import { toCmKey } from "./config";

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
