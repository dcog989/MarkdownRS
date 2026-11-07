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

  it("finds CSS and conversion function colors", () => {
    const found = findColorLiterals(
      "rgb(255 0 0) hsl(120, 100%, 50%) oklch(0.7 0.1 200) oklab(0.6 0.2 0.1) Okhsl(144 0.78 0.85) okhsv(25 0.3 0.16) hsv(120 1 0.5) hsb(0 100% 100%) device-cmyk(0% 0% 0% 100%) cmyk(0 0 0 100)",
    ).map((m) => m.literal);
    expect(found).toEqual([
      "rgb(255 0 0)",
      "hsl(120, 100%, 50%)",
      "oklch(0.7 0.1 200)",
      "oklab(0.6 0.2 0.1)",
      "Okhsl(144 0.78 0.85)",
      "okhsv(25 0.3 0.16)",
      "hsv(120 1 0.5)",
      "hsb(0 100% 100%)",
      "device-cmyk(0% 0% 0% 100%)",
      "cmyk(0 0 0 100)",
    ]);
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
  it("passes CSS-native literals through untouched", () => {
    expect(resolveSwatchColor("#ff0000")).toBe("#ff0000");
    expect(resolveSwatchColor("rgba(0, 0, 0, 0.5)")).toBe("rgba(0, 0, 0, 0.5)");
    expect(resolveSwatchColor("oklch(0.7 0.1 200)")).toBe("oklch(0.7 0.1 200)");
  });

  it("converts okhsl", () => {
    expect(resolveSwatchColor("Okhsl(144 0.78 0.85)")).toBe("rgb(146 239 145)");
    expect(resolveSwatchColor("okhsl(144 78% 85%)")).toBe("rgb(146 239 145)");
  });

  it("converts okhsv", () => {
    expect(resolveSwatchColor("okhsv(25 0.3 0.16)")).toBe("rgb(39 25 24)");
  });

  it("converts hsv and hsb", () => {
    expect(resolveSwatchColor("hsv(120 100% 50%)")).toBe("rgb(0 128 0)");
    expect(resolveSwatchColor("hsv(120 1 0.5)")).toBe("rgb(0 128 0)");
    expect(resolveSwatchColor("hsb(120, 100%, 50%)")).toBe("rgb(0 128 0)");
  });

  it("keeps alpha", () => {
    expect(resolveSwatchColor("hsv(120 100% 50% / 0.5)")).toBe("rgb(0 128 0 / 0.5)");
  });

  it("converts device-cmyk and cmyk", () => {
    expect(resolveSwatchColor("device-cmyk(0% 100% 100% 0%)")).toBe("#ff0000ff");
    expect(resolveSwatchColor("cmyk(0 100 100 0)")).toBe("#ff0000ff");
    expect(resolveSwatchColor("device-cmyk(0% 100% 100% 0% / 0.5)")).toBe("#ff000080");
    expect(resolveSwatchColor("cmyk(foo)")).toBeNull();
  });

  it("returns null for a non-color literal", () => {
    expect(resolveSwatchColor("not-a-color()")).toBeNull();
  });
});
