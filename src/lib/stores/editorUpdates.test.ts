import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "$lib/utils/config";
import { hashContent } from "$lib/utils/contentHash";
import { clearTabCaches } from "./editorCache";
import { editorStore } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";
import { markAsSaved, reloadTabContent, updateContent, updateContentOnly } from "./editorUpdates";

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

describe("updateContent", () => {
  beforeEach(() => {
    clearTabCaches("t1");
    editorStore.tabs = [];
    editorStore.sessionDirty = false;
  });

  it("keeps the last known size while the tab is still large", () => {
    editorStore.tabs = [
      tab({ content: "before", lastSavedHash: hashContent("before"), sizeBytes: 3_000_000, path: "/big.md" }),
    ];
    const stillLarge = "a".repeat(CONFIG.PERFORMANCE.LARGE_FILE_SIMPLE_MODE_BYTES + 1);

    updateContent("t1", stillLarge, 1);

    expect(editorStore.tabs[0].sizeBytes).toBe(3_000_000);
    expect(editorStore.tabs[0].isDirty).toBe(true);
  });

  it("re-measures a large tab that shrank below the limit", () => {
    editorStore.tabs = [
      tab({ content: "before", lastSavedHash: hashContent("before"), sizeBytes: 3_000_000, path: "/big.md" }),
    ];

    updateContent("t1", "after", 1);

    expect(editorStore.tabs[0].content).toBe("after");
    expect(editorStore.tabs[0].sizeBytes).toBe(5);
    expect(editorStore.tabs[0].isDirty).toBe(true);
  });

  it("still clears dirty when a small tab returns to its saved text", () => {
    editorStore.tabs = [tab({ content: "saved", lastSavedHash: hashContent("saved"), sizeBytes: 5, path: "/note.md" })];

    updateContent("t1", "changed", 1);
    expect(editorStore.tabs[0].isDirty).toBe(true);

    updateContent("t1", "saved", 1);
    expect(editorStore.tabs[0].isDirty).toBe(false);
  });
});

describe("updateContentOnly", () => {
  beforeEach(() => {
    clearTabCaches("t1");
    editorStore.tabs = [];
    editorStore.sessionDirty = false;
  });

  it("refreshes line and column stats when the text is replaced", () => {
    editorStore.tabs = [tab({ content: "old", lineCount: 1, widestColumn: 3 })];

    updateContentOnly("t1", "one\ntwo longer", true);

    expect(editorStore.tabs[0].content).toBe("one\ntwo longer");
    expect(editorStore.tabs[0].lineCount).toBe(2);
    expect(editorStore.tabs[0].widestColumn).toBe(10);
    expect(editorStore.tabs[0].wordCountPending).toBe(true);
  });
});
