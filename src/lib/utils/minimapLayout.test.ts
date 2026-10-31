import { describe, expect, it } from "vitest";
import { fitLines, lineToY, type MinimapLayout, minimapLineHeight, yToLine } from "./minimapLayout";

const UNCOMPRESSED: MinimapLayout = {
  totalLines: 100,
  compressed: false,
  lineH: 2,
  gap: 1,
  totalBars: 1,
  linesPerBar: 100,
};

const COMPRESSED: MinimapLayout = {
  totalLines: 1000,
  compressed: true,
  lineH: 0.5,
  gap: 0,
  totalBars: 100,
  linesPerBar: 10,
};

describe("fitLines", () => {
  it("keeps full rows when the document fits", () => {
    expect(fitLines(300, 100, 2, 1)).toEqual({ lineH: 2, gap: 1 });
  });

  it("gives a single line the whole height", () => {
    expect(fitLines(700, 1, 2, 1)).toEqual({ lineH: 700, gap: 0 });
  });

  it("shrinks the gap before the rows hit the 1px floor", () => {
    expect(fitLines(25, 10, 2, 1)).toEqual({ lineH: 1.6, gap: 1 });
  });

  it("drops the gap and shrinks rows below 1px on a long document", () => {
    expect(fitLines(50, 100, 2, 1)).toEqual({ lineH: 0.5, gap: 0 });
  });
});

describe("line positions", () => {
  it("round-trips a line through its row in text mode", () => {
    expect(lineToY(UNCOMPRESSED, 10)).toBe(30);
    expect(yToLine(UNCOMPRESSED, 31)).toBe(10);
    expect(yToLine(UNCOMPRESSED, 29)).toBe(9);
  });

  it("round-trips a line through its bar in compressed mode", () => {
    expect(lineToY(COMPRESSED, 25)).toBe(2);
    expect(yToLine(COMPRESSED, 2)).toBe(20);
    expect(lineToY(COMPRESSED, 1000)).toBe(99);
    expect(yToLine(COMPRESSED, 99)).toBe(990);
  });

  it("uses the drawn row height for the viewport band", () => {
    expect(minimapLineHeight(UNCOMPRESSED)).toBe(2);
    expect(minimapLineHeight(COMPRESSED)).toBe(1);
  });
});
