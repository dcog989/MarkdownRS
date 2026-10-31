import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import type { FileEntry } from "$lib/types/api";

vi.mock("$lib/i18n", () => ({
  translate: (key: string) => key,
}));

vi.mock("$lib/utils/fileSystem", () => ({
  openFile: vi.fn(),
  renameFile: vi.fn(),
  requestCloseTab: vi.fn(),
}));

vi.mock("$lib/utils/fileIO", () => ({
  createDirOnDisk: vi.fn(),
  createFileOnDisk: vi.fn(),
  renameFileOnDisk: vi.fn(),
  trashFileOnDisk: vi.fn(),
}));

vi.mock("$lib/services/fileWatcher", () => ({
  fileWatcher: { unwatch: vi.fn(), watch: vi.fn(), renew: vi.fn() },
}));

vi.mock("$lib/services/fileMetadata", () => ({
  invalidateMetadataCache: vi.fn(),
}));

vi.mock("$lib/stores/dialogStore.svelte", () => ({
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
}));

vi.mock("$lib/stores/editorStore.svelte", () => ({
  updateTabFields: vi.fn(),
}));

vi.mock("$lib/stores/fileTreeStore.svelte", () => ({
  dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
  forgetSubtree: vi.fn(),
  refreshDirectoryIfInTree: vi.fn(),
}));

vi.mock("$lib/stores/bookmarkStore.svelte", () => ({
  pruneBookmarksUnder: vi.fn(),
}));

vi.mock("$lib/stores/fileHistoryStore.svelte", () => ({
  pruneFileHistoryUnder: vi.fn(),
}));

vi.mock("$lib/stores/state.svelte", () => ({
  appContext: {
    editor: { tabs: [] },
    settings: { confirmationSuppressed: false },
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

import { pruneBookmarksUnder } from "$lib/stores/bookmarkStore.svelte";
import { confirmDialog } from "$lib/stores/dialogStore.svelte";
import { pruneFileHistoryUnder } from "$lib/stores/fileHistoryStore.svelte";
import { forgetSubtree } from "$lib/stores/fileTreeStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { trashFileOnDisk } from "$lib/utils/fileIO";
import { requestCloseTab } from "$lib/utils/fileSystem";
import { FileTreeContextMenuLogic } from "./fileTreeContextMenuLogic.svelte";

const fileEntry: FileEntry = {
  name: "a.md",
  path: "/root/a.md",
  is_dir: false,
  size: 1,
  modified: null,
};

function tab(): EditorTab {
  return {
    id: "t1",
    title: "a.md",
    content: "unsaved",
    lastSavedHash: "",
    isDirty: true,
    path: "/root/a.md",
    sizeBytes: 1,
    wordCount: 1,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
  };
}

function makeLogic(onClose = vi.fn()) {
  return new FileTreeContextMenuLogic("/root", fileEntry, onClose);
}

describe("FileTreeContextMenuLogic.handleDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appContext.settings.confirmationSuppressed = false;
    appContext.editor.tabs = [tab()];
    vi.mocked(confirmDialog).mockResolvedValue("discard");
    vi.mocked(trashFileOnDisk).mockResolvedValue(true);
  });

  it("does not trash the file when closing the dirty tab is cancelled", async () => {
    const onClose = vi.fn();

    await makeLogic(onClose).handleDelete();

    expect(requestCloseTab).toHaveBeenCalledWith("t1", true);
    expect(trashFileOnDisk).not.toHaveBeenCalled();
    expect(forgetSubtree).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the tabs before trashing, then prunes their bookmarks and history", async () => {
    vi.mocked(requestCloseTab).mockImplementation(async () => {
      appContext.editor.tabs = [];
    });

    await makeLogic().handleDelete();

    expect(trashFileOnDisk).toHaveBeenCalledWith("/root/a.md");
    expect(vi.mocked(requestCloseTab).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(trashFileOnDisk).mock.invocationCallOrder[0],
    );
    expect(forgetSubtree).toHaveBeenCalledWith("/root/a.md");
    expect(pruneBookmarksUnder).toHaveBeenCalledWith("/root/a.md");
    expect(pruneFileHistoryUnder).toHaveBeenCalledWith("/root/a.md");
  });
});
