import { describe, expect, it } from "vitest";
import { computeContentDiff } from "./tabSync";

describe("computeContentDiff", () => {
  it("returns null when the texts are equal", () => {
    expect(computeContentDiff("same", "same")).toBeNull();
    expect(computeContentDiff("", "")).toBeNull();
  });

  it("inserts into an empty document", () => {
    expect(computeContentDiff("", "hello")).toEqual({ from: 0, to: 0, insert: "hello" });
  });

  it("appends at the end", () => {
    expect(computeContentDiff("hello", "hello world")).toEqual({ from: 5, to: 5, insert: " world" });
  });

  it("replaces only the changed middle", () => {
    expect(computeContentDiff("abc", "abXc")).toEqual({ from: 2, to: 2, insert: "X" });
    expect(computeContentDiff("one two three", "one 2 three")).toEqual({ from: 4, to: 7, insert: "2" });
  });

  it("deletes the whole document", () => {
    expect(computeContentDiff("gone", "")).toEqual({ from: 0, to: 4, insert: "" });
  });
});
