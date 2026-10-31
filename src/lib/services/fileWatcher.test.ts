import type { WatchEvent } from "@tauri-apps/plugin-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab } from "$lib/stores/editorStore.svelte";

const watchState = vi.hoisted(() => ({
  handler: null as ((event: WatchEvent) => void) | null,
  unwatch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  watchImmediate: vi.fn(async (_path: string, handler: (event: WatchEvent) => void) => {
    watchState.handler = handler;
    return watchState.unwatch;
  }),
}));

// The debounce is not what this test covers; run the handler immediately.
vi.mock("$lib/utils/timing", () => ({
  debounce: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("$lib/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("$lib/services/fileMetadata", () => ({
  hasFileChanged: vi.fn(),
  reloadFileContent: vi.fn(),
  sanitizePath: (path: string) => path,
}));

vi.mock("$lib/stores/editorStore.svelte", () => ({
  updateTransientState: vi.fn(),
}));

vi.mock("$lib/stores/state.svelte", () => ({
  appContext: { editor: { tabs: [] } },
}));

vi.mock("$lib/stores/toastStore.svelte", () => ({
  showToast: vi.fn(),
}));

import { hasFileChanged, reloadFileContent } from "$lib/services/fileMetadata";
import { appContext } from "$lib/stores/state.svelte";
import { fileWatcher } from "./fileWatcher";

function tab(id: string, path: string): EditorTab {
  return {
    id,
    title: path.split("/").pop() ?? "",
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path,
    sizeBytes: 0,
    wordCount: 0,
    lineCount: 0,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
  };
}

describe("fileWatcher external change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watchState.handler = null;
    appContext.editor.tabs = [];
  });

  afterEach(() => {
    fileWatcher.unwatch("t1");
    fileWatcher.unwatch("t2");
  });

  it("reloads every clean tab that shares the file through the guarded reload", async () => {
    appContext.editor.tabs = [tab("t1", "/a.md"), tab("t2", "/a.md")];
    vi.mocked(hasFileChanged).mockResolvedValue(true);

    await fileWatcher.watch("t1", "/a.md");
    await fileWatcher.watch("t2", "/a.md");

    watchState.handler?.({ type: "any", paths: ["/a.md"], attrs: null } as WatchEvent);

    // Each tab goes through reloadFileContent, which re-checks whether that tab
    // was edited while an earlier reload was in flight.
    await vi.waitFor(() => {
      expect(reloadFileContent).toHaveBeenCalledWith("t1");
      expect(reloadFileContent).toHaveBeenCalledWith("t2");
    });
  });
});
