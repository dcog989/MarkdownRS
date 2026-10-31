import { beforeEach, describe, expect, it } from "vitest";
import { editorStore, updateTab } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    title: "t1",
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path: null,
    sizeBytes: 0,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
    ...overrides,
  };
}

describe("updateTab", () => {
  beforeEach(() => {
    editorStore.tabs = [tab()];
    editorStore.sessionDirty = false;
  });

  it("does not mark the session dirty when nothing changes", () => {
    expect(updateTab("t1", () => undefined)).toBe(true);
    expect(updateTab("t1", () => ({}))).toBe(true);
    expect(updateTab("t1", (current) => ({ title: current.title }))).toBe(true);

    expect(editorStore.sessionDirty).toBe(false);
  });

  it("assigns the field and marks the session dirty on a real change", () => {
    updateTab("t1", () => ({ title: "Renamed" }));

    expect(editorStore.tabs[0].title).toBe("Renamed");
    expect(editorStore.sessionDirty).toBe(true);
  });

  it("assigns without dirtying the session when markDirty is off", () => {
    updateTab("t1", () => ({ cursor: { anchor: 1, head: 1 } }), false);

    expect(editorStore.tabs[0].cursor).toEqual({ anchor: 1, head: 1 });
    expect(editorStore.sessionDirty).toBe(false);
  });
});
