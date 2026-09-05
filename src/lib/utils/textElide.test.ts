import { describe, expect, it } from "vitest";
import { elideMiddle } from "./textElide";

describe("elideMiddle", () => {
  it("returns the text unchanged when within the max length", () => {
    expect(elideMiddle("short.md", 48)).toBe("short.md");
  });

  it("elides the middle of a long path", () => {
    const path = "/home/user/very/long/directory/structure/templates/base-template.md";
    const result = elideMiddle(path, 32);

    expect(result.length).toBeLessThanOrEqual(32);
    expect(result).toContain("…");
    expect(result.startsWith(path.slice(0, Math.ceil((32 - 1) / 2)))).toBe(true);
    expect(result.endsWith(path.slice(-Math.floor((32 - 1) / 2)))).toBe(true);
  });

  it("keeps the full path when it is shorter than the max length", () => {
    const path = "/templates/base.md";
    expect(elideMiddle(path, 32)).toBe(path);
  });

  it("handles a max length too small for the ellipsis", () => {
    expect(elideMiddle("/long/path/to/template.md", 1)).toBe("/");
    expect(elideMiddle("/long/path/to/template.md", 0)).toBe("");
  });
});
