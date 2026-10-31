import { describe, expect, it } from "vitest";
import { fuzzyMatches } from "./fuzzyMatch";

describe("fuzzyMatches", () => {
  it("matches an empty query", () => {
    expect(fuzzyMatches("", "anything.md")).toBe(true);
  });

  it("returns false when the query is not a subsequence", () => {
    expect(fuzzyMatches("xyz", "note.md")).toBe(false);
    expect(fuzzyMatches("ba", "ab.md")).toBe(false);
  });

  it("requires the characters in query order, case-insensitively", () => {
    expect(fuzzyMatches("md", "docs/notes.md")).toBe(true);
    expect(fuzzyMatches("mdn", "docs/notes.md")).toBe(false);
    expect(fuzzyMatches("READ", "readme.md")).toBe(true);
  });
});
