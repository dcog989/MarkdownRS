import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn(),
  callBackendSafe: vi.fn(),
}));

vi.mock("$lib/utils/editorCommands", () => ({
  getEditorInstance: vi.fn(),
}));

vi.mock("$lib/utils/logger", () => ({
  logToBackend: vi.fn(),
  logger: {
    editor: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    session: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    file: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    spellcheck: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

import { appState } from "$lib/stores/appState.svelte";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { editorStore } from "$lib/stores/editorStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { loadTabContentLazy } from "./tabLoadStateMachine";

const mockedCallBackend = vi.mocked(callBackend);

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    title: "t1",
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path: "/note.md",
    sizeBytes: 0,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
    contentLoaded: false,
    ...overrides,
  };
}

const loadTabContent = (async (command: string) => {
  if (command === "load_tab_content") return { content: "hello" };
  if (command === "read_text_file") return { content: "hello", encoding: "UTF-8", has_bom: false };
  return null;
}) as unknown as typeof callBackend;

describe("loadTabContentLazy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.tabs = [tab()];
    appState.activeTabId = "t1";
    appState.paneTabs = [null, null];
  });

  it("coalesces concurrent loads into one backend read", async () => {
    mockedCallBackend.mockImplementation(loadTabContent);

    const [first, second] = await Promise.all([loadTabContentLazy("t1"), loadTabContentLazy("t1")]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mockedCallBackend.mock.calls.filter(([command]) => command === "load_tab_content")).toHaveLength(1);
    expect(editorStore.tabs[0].content).toBe("hello");
    expect(editorStore.tabs[0].contentLoaded).toBe(true);
  });

  it("retries after a failed load", async () => {
    let failNext = true;
    const impl = (async (command: string) => {
      if (command === "load_tab_content") {
        if (failNext) {
          failNext = false;
          throw new Error("db locked");
        }
        return { content: "hello" };
      }
      if (command === "read_text_file") return { content: "hello", encoding: "UTF-8", has_bom: false };
      return null;
    }) as unknown as typeof callBackend;
    mockedCallBackend.mockImplementation(impl);

    expect(await loadTabContentLazy("t1")).toBe(false);
    expect(editorStore.tabs[0].contentLoaded).toBe(false);

    expect(await loadTabContentLazy("t1")).toBe(true);
    expect(editorStore.tabs[0].content).toBe("hello");
    expect(editorStore.tabs[0].contentLoaded).toBe(true);
  });
});
