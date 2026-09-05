import { describe, expect, it } from "vitest";
import { fuzzyMatch, fuzzyMatches } from "./fuzzyMatch";

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

describe("fuzzyMatch", () => {
  it("matches an empty query without a score penalty", () => {
    expect(fuzzyMatch("", "anything.md")).toEqual({ score: 0, positions: [] });
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "note.md")).toBeNull();
    expect(fuzzyMatch("ba", "ab.md")).toBeNull();
  });

  it("requires the characters in query order", () => {
    expect(fuzzyMatch("md", "docs/notes.md")).not.toBeNull();
    expect(fuzzyMatch("mdn", "docs/notes.md")).toBeNull();
  });

  it("matches case-insensitively but prefers exact casing", () => {
    expect(fuzzyMatch("read", "README.md")).not.toBeNull();
    const exact = fuzzyMatch("read", "readme.md");
    const mixed = fuzzyMatch("read", "ReadME.md");
    expect(exact?.score).toBeGreaterThan(mixed?.score ?? Infinity);
  });

  it("prefers consecutive matches over gapped ones", () => {
    const consecutive = fuzzyMatch("ab", "abc.md");
    const gapped = fuzzyMatch("ab", "aXb.md");
    expect(consecutive?.score).toBeGreaterThan(gapped?.score ?? Infinity);
  });

  it("scores a baseline prefix match higher than a buried path match", () => {
    const inBasename = fuzzyMatch("notes", "notes.md");
    const inDirectory = fuzzyMatch("notes", "src/notes-v2/main.rs");
    expect(inBasename?.score).toBeGreaterThan(inDirectory?.score ?? Infinity);
  });

  it("scores matches at segment boundaries higher", () => {
    const boundary = fuzzyMatch("doc", "docs/final.md");
    const inside = fuzzyMatch("doc", "adoc/notes.md");
    expect(boundary?.score).toBeGreaterThan(inside?.score ?? Infinity);
  });

  it("reports the positions of matched characters", () => {
    const result = fuzzyMatch("nm", "notes/main.md");
    expect(result).not.toBeNull();
    expect(result?.positions).toEqual([0, 6]);
  });
});
