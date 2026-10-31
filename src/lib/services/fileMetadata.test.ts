import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn(),
  callBackendSafe: vi.fn(),
}));

vi.mock("$lib/utils/editorCommands", () => ({
  getEditorInstance: vi.fn(),
}));

import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { editorStore } from "$lib/stores/editorStore.svelte";
import { callBackendSafe } from "$lib/utils/backend";
import { getCachedFileMetadata, reloadFileContent } from "./fileMetadata";

const mockedCallBackendSafe = vi.mocked(callBackendSafe);

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    title: "big.md",
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path: "/big.md",
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

describe("reloadFileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.tabs = [tab()];
    editorStore.sessionDirty = false;
  });

  it("keeps text typed while the file read is in flight", async () => {
    const readInFlight = ((command: string) => {
      if (command === "read_text_file") {
        editorStore.tabs[0].content = "typed while loading";
      }
      return Promise.resolve({ content: "# disk\n", encoding: "UTF-8", has_bom: false });
    }) as unknown as typeof callBackendSafe;
    mockedCallBackendSafe.mockImplementation(readInFlight);

    await reloadFileContent("t1");

    expect(editorStore.tabs[0].content).toBe("typed while loading");
    expect(editorStore.tabs[0].contentLoaded).toBe(true);
    expect(editorStore.tabs[0].isDirty).toBe(true);
  });
});

describe("getCachedFileMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses a fresh result", async () => {
    const ok = (async () => ({ size: 1 })) as unknown as typeof callBackendSafe;
    mockedCallBackendSafe.mockImplementation(ok);

    await getCachedFileMetadata("/cached.md");
    await getCachedFileMetadata("/cached.md");

    expect(mockedCallBackendSafe).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a failed read", async () => {
    const missing = (async () => null) as unknown as typeof callBackendSafe;
    mockedCallBackendSafe.mockImplementation(missing);

    await expect(getCachedFileMetadata("/missing.md")).rejects.toThrow();
    await expect(getCachedFileMetadata("/missing.md")).rejects.toThrow();

    expect(mockedCallBackendSafe).toHaveBeenCalledTimes(2);
  });
});
