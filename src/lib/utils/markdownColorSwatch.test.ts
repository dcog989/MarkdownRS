import { describe, expect, it } from "vitest";
import { findColorLiterals } from "./markdownColorSwatch";

describe("findColorLiterals", () => {
  it("finds hex colors of every supported length", () => {
    expect(findColorLiterals("#fff #ffff #ffffff #ffffffff").map((m) => m.literal)).toEqual([
      "#fff",
      "#ffff",
      "#ffffff",
      "#ffffffff",
    ]);
  });

  it("does not split a longer hex run into a short match", () => {
    expect(findColorLiterals("#ffffff").map((m) => m.literal)).toEqual(["#ffffff"]);
  });

  it("finds CSS function colors", () => {
    const found = findColorLiterals("rgb(255 0 0) hsl(120, 100%, 50%) oklch(0.7 0.1 200) oklab(0.6 0.2 0.1)").map(
      (m) => m.literal,
    );
    expect(found).toEqual(["rgb(255 0 0)", "hsl(120, 100%, 50%)", "oklch(0.7 0.1 200)", "oklab(0.6 0.2 0.1)"]);
  });

  it("ignores okhsl, which is not a CSS color function", () => {
    expect(findColorLiterals("okhsl(0.5 1 0.5)")).toEqual([]);
  });

  it("ignores hex glued to an identifier", () => {
    expect(findColorLiterals("abc#fff")).toEqual([]);
    expect(findColorLiterals("##fff")).toEqual([]);
  });

  it("ignores function names that are part of a longer identifier", () => {
    expect(findColorLiterals("myrgb(1 2 3)")).toEqual([]);
  });

  it("reports the index of each match", () => {
    expect(findColorLiterals("a #ff0000 b")).toEqual([{ literal: "#ff0000", index: 2 }]);
  });
});
