import { describe, expect, it } from "vitest";
import type { EditorTab } from "$lib/stores/editorTypes";
import { tabTooltip } from "./tabDisplay";

const labels = { missing: "missing", unsaved: "untitled" };

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    title: "notes.md",
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path: "/docs/notes.md",
    sizeBytes: 2048,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
    formattedTimestamp: "2026-01-01",
    ...overrides,
  };
}

describe("tabTooltip", () => {
  it("shows the path, timestamp and size of a saved tab", () => {
    expect(tabTooltip(tab(), labels)).toBe("/docs/notes.md\n2026-01-01, 2 KB");
  });

  it("names a missing file above its path", () => {
    expect(tabTooltip(tab({ fileCheckFailed: true }), labels)).toBe("missing\n/docs/notes.md\n2026-01-01, 2 KB");
  });

  it("falls back to the unsaved label without a path or timestamp", () => {
    expect(tabTooltip(tab({ path: undefined, formattedTimestamp: undefined }), labels)).toBe("untitled\n2 KB");
  });

  it("prepends the tab name for icon-only tabs", () => {
    expect(tabTooltip(tab({ customTitle: "My Doc" }), labels, true)).toBe("My Doc\n/docs/notes.md\n2026-01-01, 2 KB");
  });
});
