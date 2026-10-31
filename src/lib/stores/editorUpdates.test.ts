import { beforeEach, describe, expect, it } from "vitest";
import { hashContent } from "$lib/utils/contentHash";
import { editorStore } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";
import { markAsSaved, reloadTabContent } from "./editorUpdates";

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    title: "t1",
    content: "",
    lastSavedHash: "",
    isDirty: true,
    path: "/note.md",
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

describe("markAsSaved", () => {
  beforeEach(() => {
    editorStore.tabs = [];
    editorStore.sessionDirty = false;
  });

  it("uses the written text as the saved baseline", () => {
    editorStore.tabs = [tab({ content: "written" })];

    markAsSaved("t1", "written");

    expect(editorStore.tabs[0].lastSavedHash).toBe(hashContent("written"));
    expect(editorStore.tabs[0].isDirty).toBe(false);
  });

  it("keeps edits made while the write was in flight dirty", () => {
    editorStore.tabs = [tab({ content: "typed while saving" })];

    markAsSaved("t1", "written");

    expect(editorStore.tabs[0].lastSavedHash).toBe(hashContent("written"));
    expect(editorStore.tabs[0].isDirty).toBe(true);
  });
});

describe("reloadTabContent", () => {
  beforeEach(() => {
    editorStore.tabs = [];
    editorStore.sessionDirty = false;
  });

  it("marks a reopened tab as loaded so it can be saved again", () => {
    editorStore.tabs = [tab({ content: "", contentLoaded: false })];

    reloadTabContent("t1", "# disk\n", "LF", "UTF-8", 7, false);

    expect(editorStore.tabs[0].content).toBe("# disk\n");
    expect(editorStore.tabs[0].contentLoaded).toBe(true);
  });
});
