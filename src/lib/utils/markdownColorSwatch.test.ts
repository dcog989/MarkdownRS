import { describe, expect, it } from "vitest";
import { findColorLiterals, resolveSwatchColor } from "./markdownColorSwatch";

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
    const found = findColorLiterals("rgb(255 0 0) hsl(120, 100%, 50%) oklch(0.7 0.1 200)").map((m) => m.literal);
    expect(found).toEqual(["rgb(255 0 0)", "hsl(120, 100%, 50%)", "oklch(0.7 0.1 200)"]);
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

describe("resolveSwatchColor", () => {
  it("passes native literals through untouched", () => {
    expect(resolveSwatchColor("#ff0000")).toBe("#ff0000");
    expect(resolveSwatchColor("rgba(0, 0, 0, 0.5)")).toBe("rgba(0, 0, 0, 0.5)");
    expect(resolveSwatchColor("oklch(0.7 0.1 200)")).toBe("oklch(0.7 0.1 200)");
  });

  it("converts oklab to an sRGB color", () => {
    expect(resolveSwatchColor("oklab(0.6279 0.2249 0.1258)")).toBe("rgb(255 0 0)");
  });

  it("handles the white and black oklab endpoints", () => {
    expect(resolveSwatchColor("oklab(1 0 0)")).toBe("rgb(255 255 255)");
    expect(resolveSwatchColor("oklab(0 0 0)")).toBe("rgb(0 0 0)");
  });

  it("converts okhsl endpoints and returns a valid sRGB string otherwise", () => {
    expect(resolveSwatchColor("okhsl(0.5 1 1)")).toBe("rgb(255 255 255)");
    expect(resolveSwatchColor("okhsl(0.5 1 0)")).toBe("rgb(0 0 0)");
    expect(resolveSwatchColor("okhsl(0.15 1 0.5)")).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it("returns null for a non-color literal", () => {
    expect(resolveSwatchColor("not-a-color()")).toBeNull();
  });
});
