import { describe, expect, it } from "vitest";
import { buildLineMap, interpolate, type LineMapEntry } from "./scrollInterpolation";

function block(line: number, top: number): HTMLElement {
  const el = document.createElement("p");
  el.setAttribute("data-sourcepos", `${line}:1-${line}:5`);
  el.getBoundingClientRect = () =>
    ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  return el;
}

function containerWith(scrollHeight: number, children: HTMLElement[]): HTMLElement {
  const container = document.createElement("div");
  container.append(...children);
  Object.defineProperty(container, "scrollHeight", { value: scrollHeight });
  return container;
}

describe("buildLineMap", () => {
  it("keeps body blocks in DOM order", () => {
    const map = buildLineMap(containerWith(300, [block(1, 0), block(5, 100), block(9, 250)]), 12);

    expect(map).toEqual([
      { line: 1, y: 0 },
      { line: 5, y: 100 },
      { line: 9, y: 250 },
      { line: 12, y: 300 },
    ]);
  });

  it("drops a block whose source line points back up, like a footnote section", () => {
    // The footnote section renders last but keeps the definition's line 3.
    const map = buildLineMap(containerWith(300, [block(1, 0), block(5, 100), block(3, 280)]), 6);

    expect(map).toEqual([
      { line: 1, y: 0 },
      { line: 5, y: 100 },
      { line: 6, y: 300 },
    ]);
  });
});

describe("interpolate", () => {
  const map: LineMapEntry[] = [
    { line: 1, y: 0 },
    { line: 3, y: 100 },
    { line: 5, y: 200 },
  ];

  it("maps a value between two points in either direction", () => {
    expect(interpolate(4, "line", "y", map)).toBe(150);
    expect(interpolate(150, "y", "line", map)).toBe(4);
  });

  it("returns the first value at the top of the map", () => {
    expect(interpolate(1, "line", "y", map)).toBe(0);
  });

  it("returns the only value for a single-entry map", () => {
    expect(interpolate(42, "line", "y", [{ line: 1, y: 0 }])).toBe(0);
  });

  it("does not divide by a zero span", () => {
    const flatY: LineMapEntry[] = [
      { line: 1, y: 0 },
      { line: 2, y: 50 },
      { line: 3, y: 50 },
    ];

    expect(interpolate(60, "y", "line", flatY)).toBe(2);
  });

  it("extrapolates past the last entry, the caller clamps the result", () => {
    const map2: LineMapEntry[] = [
      { line: 1, y: 0 },
      { line: 5, y: 200 },
    ];
    expect(interpolate(10, "line", "y", map2)).toBe(450);
  });
});
