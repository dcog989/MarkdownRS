import { describe, expect, it } from "vitest";
import { extractSmartTitle } from "./smartTitle";

describe("extractSmartTitle", () => {
  it("skips YAML frontmatter keys", () => {
    expect(extractSmartTitle("---\ntitle: Test\ntags: [a]\n---\n# Body\n")).toBe("Body");
  });

  it("skips TOML frontmatter keys", () => {
    expect(extractSmartTitle('+++\ntitle = "Test"\n+++\nBody\n')).toBe("Body");
  });

  it("returns null for a frontmatter-only document", () => {
    expect(extractSmartTitle("---\ntitle: Test\n---\n")).toBeNull();
  });

  it("uses the first content line when there is no frontmatter", () => {
    expect(extractSmartTitle("# Hello\nWorld")).toBe("Hello");
  });
});
