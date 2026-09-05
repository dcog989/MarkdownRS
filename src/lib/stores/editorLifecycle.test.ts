import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/fileIO", () => ({
  readTextFile: vi.fn(),
}));

import { readTextFile } from "$lib/utils/fileIO";
import { createNewFile, reorderTabs } from "./editorLifecycle";
import { editorStore, sortTabsPinnedFirst } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";
import { settingsState } from "./settingsState.svelte";

const mockedReadTextFile = vi.mocked(readTextFile);

describe("createNewFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.newFileTemplatePath = "";
    editorStore.tabs = [];
    editorStore.mruStack = [];
  });

  it("creates an empty tab when no template is configured", async () => {
    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe("");
    expect(mockedReadTextFile).not.toHaveBeenCalled();
  });

  it("uses the template file content when a template is configured", async () => {
    settingsState.newFileTemplatePath = "/templates/base.md";
    mockedReadTextFile.mockResolvedValue({
      content: "# Title\n\nBody text",
      encoding: "UTF-8",
      has_bom: false,
    });

    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe("# Title\n\nBody text");
    expect(mockedReadTextFile).toHaveBeenCalledWith("/templates/base.md");
  });

  it("creates a blank tab if the template cannot be read", async () => {
    settingsState.newFileTemplatePath = "/templates/missing.md";
    mockedReadTextFile.mockRejectedValue(new Error("file not found"));

    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe("");
  });

  it("marks a template-backed unsaved tab as dirty so closing prompts for a save", async () => {
    settingsState.newFileTemplatePath = "/templates/base.md";
    mockedReadTextFile.mockResolvedValue({
      content: "# Title\n\nBody text",
      encoding: "UTF-8",
      has_bom: false,
    });

    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.isDirty).toBe(true);
    expect(tab?.path).toBeNull();
  });

  it("leaves an empty unsaved tab clean", async () => {
    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.isDirty).toBe(false);
  });
});

function tab(id: string, isPinned: boolean): EditorTab {
  return {
    id,
    title: id,
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
    isPinned,
  };
}

describe("pinned tab ordering", () => {
  beforeEach(() => {
    editorStore.tabs = [];
  });

  it("sortTabsPinnedFirst keeps pinned tabs left of unpinned, preserving group order", () => {
    const unpinnedA = tab("u-a", false);
    const pinnedA = tab("p-a", true);
    const unpinnedB = tab("u-b", false);
    const pinnedB = tab("p-b", true);

    const sorted = sortTabsPinnedFirst([unpinnedA, pinnedA, unpinnedB, pinnedB]);

    expect(sorted.map((t) => t.id)).toEqual(["p-a", "p-b", "u-a", "u-b"]);
  });

  it("reorderTabs enforces the invariant even when given an interleaved list", () => {
    editorStore.tabs = [tab("p", true), tab("u1", false), tab("u2", false)];
    const interleaved = [tab("u1", false), tab("p", true), tab("u2", false)];

    reorderTabs(interleaved);

    const pinned = editorStore.tabs.filter((t) => t.isPinned);
    const unpinned = editorStore.tabs.filter((t) => !t.isPinned);
    expect(pinned).toHaveLength(1);
    expect(unpinned).toHaveLength(2);
    expect(editorStore.tabs[0].id).toBe("p");
  });
});
