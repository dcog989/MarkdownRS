import { describe, expect, it } from "vitest";
import { extractPathAtPos, extractWikilinkAtPos } from "./filePathExtension";

describe("extractPathAtPos", () => {
  it("extracts a plain relative path", () => {
    expect(extractPathAtPos("see ./notes/ideas.md for details", 10)).toBe("./notes/ideas.md");
  });

  it("extracts a path inside quotes, returning the quoted content", () => {
    const text = 'open "src/lib/main.ts" now';
    expect(extractPathAtPos(text, 8)).toBe("src/lib/main.ts");
  });

  it("extracts an absolute path", () => {
    const text = "file at /home/user/doc.md";
    expect(extractPathAtPos(text, 11)).toBe("/home/user/doc.md");
  });

  it("extracts a Windows-style path", () => {
    expect(extractPathAtPos("on C:\\Docs\\notes.txt here", 7)).toBe("C:\\Docs\\notes.txt");
  });

  it("extracts a URL with trailing punctuation stripped", () => {
    expect(extractPathAtPos("visit https://example.com/path, now", 10)).toBe("https://example.com/path");
  });

  it("extracts a www URL", () => {
    expect(extractPathAtPos("see www.example.com/page", 10)).toBe("www.example.com/page");
  });

  it("returns null when the position is outside any path", () => {
    expect(extractPathAtPos("no path here", 3)).toBeNull();
  });

  it("does not match a path suffix inside a word", () => {
    expect(extractPathAtPos("my notes/ideas.md rocks", 4)).toBeNull();
  });
});

describe("extractWikilinkAtPos", () => {
  it("extracts the target from a simple wikilink", () => {
    const text = "see [[notes/foo]] for details";
    expect(extractWikilinkAtPos(text, 8)).toBe("notes/foo");
  });

  it("extracts the target from a wikilink with a display label", () => {
    const text = "go to [[notes/foo|the notes]] now";
    expect(extractWikilinkAtPos(text, 10)).toBe("notes/foo");
  });

  it("trims whitespace around the target", () => {
    expect(extractWikilinkAtPos("see [[  notes/foo  ]]", 6)).toBe("notes/foo");
  });

  it("returns null when the position is outside any wikilink", () => {
    expect(extractWikilinkAtPos("no wikilink here", 3)).toBeNull();
  });
});
