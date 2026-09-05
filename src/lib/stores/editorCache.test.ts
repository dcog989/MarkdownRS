import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTabCaches,
  defaultTransientState,
  getHistoryState,
  getLineChangeTracker,
  getTransientState,
  initTabCaches,
  initTransientState,
  scheduleWordCountUpdate,
  updateHistoryState,
  updateTransientState,
} from "./editorCache";
import { editorStore } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";

function tab(id: string, content: string): EditorTab {
  return {
    id,
    title: id,
    content,
    lastSavedHash: "",
    isDirty: false,
    path: null,
    sizeBytes: content.length,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
  };
}

describe("editorCache", () => {
  beforeEach(() => {
    clearTabCaches("*");
    vi.clearAllTimers();
    editorStore.tabs = [];
  });

  it("defaultTransientState returns fresh defaults", () => {
    expect(defaultTransientState()).toEqual({
      scrollPercentage: 0,
      scrollTop: 0,
      topLine: 1,
      previewScrollTop: 0,
      contentChanged: false,
      isPersisted: false,
      fileCheckPerformed: false,
      forceFullFeatures: false,
    });
  });

  it("getLineChangeTracker creates and caches a tracker per id", () => {
    const first = getLineChangeTracker("a");
    expect(getLineChangeTracker("a")).toBe(first);
    expect(getLineChangeTracker("b")).not.toBe(first);
  });

  it("initTransientState merges overrides over defaults", () => {
    initTransientState("t1", { scrollTop: 42, forceFullFeatures: true });
    expect(getTransientState("t1")).toMatchObject({ scrollTop: 42, forceFullFeatures: true });
    expect(getTransientState("t1")?.scrollPercentage).toBe(0);
  });

  it("updateTransientState mutates an existing state and ignores unknown ids", () => {
    initTransientState("t1");
    updateTransientState("t1", { contentChanged: true });
    expect(getTransientState("t1")?.contentChanged).toBe(true);
    expect(() => updateTransientState("missing", { contentChanged: true })).not.toThrow();
  });

  it("history state round-trips", () => {
    const state = { undoDepth: 5, selections: [1, 2] };
    updateHistoryState("t1", state);
    expect(getHistoryState("t1")).toBe(state);
    expect(getHistoryState("missing")).toBeUndefined();
  });

  it("clearTabCaches drops all cached state for an id", () => {
    initTransientState("t1");
    updateHistoryState("t1", {});
    getLineChangeTracker("t1");

    clearTabCaches("t1");

    expect(getTransientState("t1")).toBeUndefined();
    expect(getHistoryState("t1")).toBeUndefined();
    expect(getLineChangeTracker("t1")).not.toBeUndefined();
  });

  it("initTabCaches seeds a tracker and a dirty transient state", () => {
    initTabCaches("t1");
    expect(getTransientState("t1")?.contentChanged).toBe(true);
    expect(getTransientState("t1")?.isPersisted).toBe(false);
  });

  it("scheduleWordCountUpdate updates the tab word count after the debounce", async () => {
    vi.useFakeTimers();
    editorStore.tabs = [tab("t1", "one two three")];

    scheduleWordCountUpdate("t1", "one two three");
    vi.advanceTimersByTime(501);
    await vi.waitFor(() => expect(editorStore.tabs[0]?.wordCount).toBe(3));
    expect(editorStore.tabs[0]?.wordCountPending).toBe(false);
    vi.useRealTimers();
  });

  it("scheduleWordCountUpdate drops the debounce for closed tabs", () => {
    vi.useFakeTimers();
    editorStore.tabs = [];

    scheduleWordCountUpdate("ghost", "anything");
    vi.advanceTimersByTime(501);
    expect(editorStore.tabs).toEqual([]);
    vi.useRealTimers();
  });

  it("scheduleWordCountUpdate debounces rapid successive calls", () => {
    vi.useFakeTimers();
    editorStore.tabs = [tab("t1", "")];

    scheduleWordCountUpdate("t1", "a");
    scheduleWordCountUpdate("t1", "a b");
    vi.advanceTimersByTime(501);

    expect(editorStore.tabs[0]?.wordCount).toBe(2);
    vi.useRealTimers();
  });
});
