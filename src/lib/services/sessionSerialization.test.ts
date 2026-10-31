import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

import { getTransientState, initTransientState, updateTransientState } from "$lib/stores/editorCache";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { closeTab, editorStore } from "$lib/stores/editorStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { persistSession } from "./sessionSerialization";

const mockedCallBackend = vi.mocked(callBackend);

function makeTab(overrides: Partial<EditorTab>): EditorTab {
  return {
    id: "tab-1",
    title: "Test",
    originalTitle: "Test",
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
    contentLoaded: true,
    ...overrides,
  };
}

describe("persistSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.tabs = [];
    editorStore.closedTabsHistory = [];
    editorStore.mruStack = [];
    editorStore.sessionDirty = true;
    editorStore.sessionRestored = true;
  });

  it("does not save until the session has been restored", async () => {
    editorStore.sessionRestored = false;
    editorStore.tabs = [makeTab({ id: "fallback", title: "Untitled", content: "", isDirty: false, path: null })];

    await persistSession();

    expect(mockedCallBackend).not.toHaveBeenCalled();
  });

  it("does not write the empty placeholder of a restored-but-unloaded tab", async () => {
    editorStore.tabs = [
      makeTab({
        id: "restored-unsaved",
        title: "test unsaved content",
        isDirty: true,
        content: "",
        contentLoaded: false,
      }),
    ];
    initTransientState("restored-unsaved", { contentChanged: true, isPersisted: true });

    await persistSession();

    const [command, payload] = mockedCallBackend.mock.calls[0] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(command).toBe("save_session");
    expect(payload.activeTabs[0].content).toBeNull();
  });

  it("writes content for a loaded dirty tab", async () => {
    editorStore.tabs = [
      makeTab({
        id: "loaded-unsaved",
        title: "test unsaved content",
        isDirty: true,
        content: "# test unsaved content\n\nblah blah blah\n",
        contentLoaded: true,
      }),
    ];
    initTransientState("loaded-unsaved", { contentChanged: true, isPersisted: true });

    await persistSession();

    const [, payload] = mockedCallBackend.mock.calls[0] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(payload.activeTabs[0].content).toBe("# test unsaved content\n\nblah blah blah\n");
  });

  it("keeps the session dirty when a tab closes during the save", async () => {
    let resolveSave: () => void = () => {};
    mockedCallBackend.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = () => resolve(undefined);
        }),
    );

    editorStore.tabs = [
      makeTab({ id: "keep" }),
      makeTab({ id: "closed", title: "Closed", path: "/closed.md", content: "unsaved text", isDirty: true }),
    ];
    initTransientState("closed", { contentChanged: true, isPersisted: false });

    const saving = persistSession();
    closeTab("closed");
    resolveSave();
    await saving;

    expect(editorStore.sessionDirty).toBe(true);

    await persistSession();

    const calls = mockedCallBackend.mock.calls;
    const [, payload] = calls[calls.length - 1] as unknown as [
      string,
      { activeTabs: Array<{ id: string }>; closedTabs: Array<{ id: string; content: string | null }> },
    ];
    expect(payload.activeTabs.map((t) => t.id)).toEqual(["keep"]);
    expect(payload.closedTabs).toContainEqual(expect.objectContaining({ id: "closed", content: "unsaved text" }));
  });

  it("hands a second caller the in-flight save so close can await it", async () => {
    let resolveSave: () => void = () => {};
    mockedCallBackend.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = () => resolve(undefined);
        }),
    );
    editorStore.tabs = [makeTab({ id: "t1", content: "text", contentLoaded: true })];
    initTransientState("t1", { contentChanged: false, isPersisted: true });

    const first = persistSession();
    const second = persistSession();

    expect(second).toBe(first);
    resolveSave();
    await second;
  });

  it("keeps a tab dirty when its content changes during the save", async () => {
    let resolveSave: () => void = () => {};
    mockedCallBackend.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveSave = () => resolve(undefined);
        }),
    );
    editorStore.tabs = [makeTab({ id: "t1", content: "before", contentLoaded: true })];
    initTransientState("t1", { contentChanged: true, isPersisted: false });

    const saving = persistSession();
    editorStore.tabs[0].content = "after";
    updateTransientState("t1", { contentChanged: true });
    editorStore.sessionDirty = true;

    resolveSave();
    await saving;

    expect(editorStore.sessionDirty).toBe(true);
    expect(getTransientState("t1")?.contentChanged).toBe(true);

    await persistSession();
    const calls = mockedCallBackend.mock.calls;
    const [, payload] = calls[calls.length - 1] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(payload.activeTabs[0].content).toBe("after");
  });

  it("marks an unchanged tab persisted and omits its content next time", async () => {
    editorStore.tabs = [makeTab({ id: "t1", content: "text", contentLoaded: true })];
    initTransientState("t1", { contentChanged: true, isPersisted: false });

    await persistSession();

    expect(getTransientState("t1")).toMatchObject({ contentChanged: false, isPersisted: true });

    editorStore.sessionDirty = true;
    await persistSession();

    const calls = mockedCallBackend.mock.calls;
    const [, payload] = calls[calls.length - 1] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(payload.activeTabs[0].content).toBeNull();
  });
});
