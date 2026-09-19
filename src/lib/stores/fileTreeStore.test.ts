import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "$lib/types/api";
import { settingsState } from "./settingsState.svelte";

vi.mock("$lib/commands/directory", () => ({
  listDirectory: vi.fn(),
  getDirectoryMtime: vi.fn(),
}));

import { getDirectoryMtime, listDirectory } from "$lib/commands/directory";
import {
  canNavigateUp,
  collapseAll,
  dirname,
  fileTreeStore,
  isDirLoading,
  isExpanded,
  loadChildren,
  navigateInto,
  navigateToParent,
  notifyFileSaved,
  refreshTree,
  revealPath,
  setRoot,
  toggle,
  toggleHiddenFiles,
  toggleMarkdownOnly,
} from "./fileTreeStore.svelte";
import { computeTreeRows } from "./treeViewStore.svelte";

const mockedListDirectory = vi.mocked(listDirectory);
const mockedGetDirectoryMtime = vi.mocked(getDirectoryMtime);

function entry(name: string, isDir = false): FileEntry {
  return {
    name,
    path: `/root/${name}`,
    is_dir: isDir,
    is_symlink: false,
    size: isDir ? 0 : 10,
    modified: null,
  };
}

describe("fileTreeStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileTreeStore.root = "";
    fileTreeStore.expanded.clear();
    fileTreeStore.children.clear();
    fileTreeStore.loading.clear();
    settingsState.fileTreeShowHidden = false;
    settingsState.fileTreeShowMarkdownOnly = false;
    settingsState.fileTreeVisible = true;
    fileTreeStore.lastLoaded.clear();
    fileTreeStore.dirMtimes.clear();
    mockedListDirectory.mockReset();
    mockedGetDirectoryMtime.mockReset();
  });

  it("setRoot sets the root, expands it, and loads its children", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);

    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));

    expect(fileTreeStore.root).toBe("/root");
    expect(isExpanded("/root")).toBe(true);
    expect(mockedListDirectory).toHaveBeenCalledWith("/root", false);
    expect(fileTreeStore.children.get("/root")).toEqual([entry("a.md")]);
  });

  it("loadChildren only fetches a directory once", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);

    await loadChildren("/root");
    await loadChildren("/root");
    await loadChildren("/root");

    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
  });

  it("loadChildren shares an in-flight load so concurrent awaiters wait for it", async () => {
    let resolveLoad: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockReturnValue(
      new Promise<FileEntry[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const first = loadChildren("/root");
    const second = loadChildren("/root");
    let secondResolved = false;
    void second.then(() => {
      secondResolved = true;
    });

    await vi.waitFor(() => expect(isDirLoading("/root")).toBe(true));
    expect(secondResolved).toBe(false);

    resolveLoad([entry("a.md")]);
    await first;
    await second;
    expect(secondResolved).toBe(true);
    expect(fileTreeStore.children.get("/root")).toEqual([entry("a.md")]);
  });

  it("toggle expands a collapsed directory and lazy-loads its children", async () => {
    mockedListDirectory.mockResolvedValue([entry("sub", true), entry("b.md")]);

    await toggle("/root");
    expect(isExpanded("/root")).toBe(true);
    expect(fileTreeStore.children.get("/root")?.[0]?.name).toBe("sub");

    mockedListDirectory.mockResolvedValue([entry("c.md")]);
    await toggle("/root/sub");
    expect(isExpanded("/root/sub")).toBe(true);
    expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false);
  });

  it("toggle collapses an expanded directory without refetching", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);

    await toggle("/root");
    await toggle("/root");

    expect(isExpanded("/root")).toBe(false);
    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
  });

  it("keeps already-loaded children when collapsing then re-expanding", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);

    await toggle("/root");
    await toggle("/root");
    await toggle("/root");

    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
    expect(fileTreeStore.children.get("/root")).toEqual([entry("a.md")]);
  });

  it("toggleHiddenFiles flips the flag, clears cache, and reloads the root", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));

    mockedListDirectory.mockResolvedValue([entry(".hidden", true), entry("a.md")]);
    toggleHiddenFiles();

    expect(settingsState.fileTreeShowHidden).toBe(true);
    expect(fileTreeStore.children.has("/root")).toBe(false);
    expect(mockedListDirectory).toHaveBeenLastCalledWith("/root", true);
    await vi.waitFor(() => expect(fileTreeStore.children.get("/root")?.length).toBe(2));
  });

  it("discards a stale in-flight listing when hidden files are toggled", async () => {
    let resolveOld: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockImplementation(
      () =>
        new Promise<FileEntry[]>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const first = setRoot("/root");
    expect(isDirLoading("/root")).toBe(true);

    mockedListDirectory.mockResolvedValue([entry(".hidden", true), entry("a.md")]);
    toggleHiddenFiles();
    await vi.waitFor(() => expect(fileTreeStore.children.get("/root")?.length).toBe(2));

    // The outdated request resolving later must not overwrite the fresh listing.
    resolveOld([entry("stale.md")]);
    await first;
    await vi.waitFor(() => expect(fileTreeStore.children.get("/root")?.length).toBe(2));
    expect(fileTreeStore.children.get("/root")?.some((e) => e.name === "stale.md")).toBe(false);
  });

  it("collapses every directory except the root", async () => {
    mockedListDirectory.mockResolvedValue([entry("sub", true)]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    await toggle("/root/sub");

    collapseAll();

    expect(isExpanded("/root")).toBe(true);
    expect(isExpanded("/root/sub")).toBe(false);
  });

  it("refreshTree reloads the root and every expanded directory", async () => {
    mockedListDirectory.mockResolvedValue([entry("sub", true), entry("a.md")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    await toggle("/root/sub");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root/sub")).toBe(true));

    mockedListDirectory.mockResolvedValue([entry("a.md"), entry("new.md")]);
    await refreshTree();

    expect(mockedListDirectory).toHaveBeenCalledWith("/root", false);
    expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false);
    expect(fileTreeStore.children.get("/root")?.some((e) => e.name === "new.md")).toBe(true);
    expect(fileTreeStore.children.get("/root/sub")?.some((e) => e.name === "new.md")).toBe(true);
  });

  it("isDirLoading tracks in-flight loads", async () => {
    let resolveLoad: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockReturnValue(
      new Promise<FileEntry[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const pending = loadChildren("/root");
    expect(isDirLoading("/root")).toBe(true);

    resolveLoad([]);
    await pending;
    expect(isDirLoading("/root")).toBe(false);
  });

  it("handles a failed listing by storing an empty child list", async () => {
    mockedListDirectory.mockRejectedValue(new Error("permission denied"));

    await loadChildren("/root");

    expect(fileTreeStore.children.get("/root")).toEqual([]);
    expect(isDirLoading("/root")).toBe(false);
  });

  it("dirname returns the parent directory", () => {
    expect(dirname("/home/user/project")).toBe("/home/user");
    expect(dirname("/home/user/file.md")).toBe("/home/user");
    expect(dirname("/home")).toBe("/");
    expect(dirname("/")).toBe("/");
    expect(dirname("")).toBe("");
  });

  it("toggleMarkdownOnly flips the markdown-only flag", () => {
    expect(settingsState.fileTreeShowMarkdownOnly).toBe(false);
    toggleMarkdownOnly();
    expect(settingsState.fileTreeShowMarkdownOnly).toBe(true);
    toggleMarkdownOnly();
    expect(settingsState.fileTreeShowMarkdownOnly).toBe(false);
  });

  it("toggle re-expands a previously loaded folder, re-listing only when its mtime changed", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    mockedGetDirectoryMtime.mockResolvedValue(1000);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));

    mockedListDirectory.mockResolvedValue([entry("b.md")]);
    await toggle("/root/sub");
    await toggle("/root/sub");
    mockedListDirectory.mockClear();

    // Fresh re-expand: mtime is recorded, cache is used, no re-list.
    await toggle("/root/sub");
    expect(mockedListDirectory).not.toHaveBeenCalled();

    // mtime changed while collapsed -> re-list on expand.
    await toggle("/root/sub");
    mockedGetDirectoryMtime.mockResolvedValue(2000);
    await toggle("/root/sub");
    expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false);
  });

  it("toggle re-lists a stale folder on expand when mtime is unavailable", async () => {
    mockedGetDirectoryMtime.mockResolvedValue(null);
    mockedListDirectory.mockResolvedValue([entry("b.md")]);
    await toggle("/root/sub");
    await toggle("/root/sub");
    mockedListDirectory.mockClear();

    fileTreeStore.lastLoaded.set("/root/sub", Date.now() - 60_000);
    await toggle("/root/sub");
    expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false);
  });

  it("notifyFileSaved re-lists the saved file directory", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    mockedListDirectory.mockClear();

    notifyFileSaved("/root/a.md");
    await vi.waitFor(() => expect(mockedListDirectory).toHaveBeenCalledWith("/root", false));
  });

  it("notifyFileSaved ignores files outside the tree root", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    mockedListDirectory.mockClear();

    notifyFileSaved("/other/b.md");
    expect(mockedListDirectory).not.toHaveBeenCalled();
  });

  it("canNavigateUp is false at the filesystem root and when no root is set", () => {
    expect(canNavigateUp()).toBe(false);
    fileTreeStore.root = "/";
    expect(canNavigateUp()).toBe(false);
    fileTreeStore.root = "/home/user";
    expect(canNavigateUp()).toBe(true);
  });

  it("navigateToParent moves the root up one level and stops at the filesystem root", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/home/user/project");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/home/user/project")).toBe(true));

    navigateToParent();
    expect(fileTreeStore.root).toBe("/home/user");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/home/user")).toBe(true));

    navigateToParent();
    expect(fileTreeStore.root).toBe("/home");
    navigateToParent();
    expect(fileTreeStore.root).toBe("/");
    navigateToParent();
    expect(fileTreeStore.root).toBe("/");
  });

  it("navigateInto moves the root into a subdirectory", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/home/user");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/home/user")).toBe(true));

    navigateInto("/home/user/project");
    expect(fileTreeStore.root).toBe("/home/user/project");
    expect(isExpanded("/home/user/project")).toBe(true);
  });

  it("navigateInto is a no-op for the current root or an empty path", () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/home/user");

    navigateInto("/home/user");
    expect(fileTreeStore.root).toBe("/home/user");
    navigateInto("");
    expect(fileTreeStore.root).toBe("/home/user");
  });

  it("revealPath expands collapsed ancestors so the target row exists", async () => {
    mockedListDirectory.mockImplementation(async (path: string) => {
      if (path === "/root/sub") {
        return [{ ...entry("deep.md"), path: "/root/sub/deep.md" }];
      }
      return [entry("a.md"), entry("sub", true)];
    });
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    expect(fileTreeStore.children.get("/root")?.some((e) => e.path === "/root/sub")).toBe(true);

    const found = await revealPath("/root/sub/deep.md");

    expect(found).toBe(true);
    expect(isExpanded("/root/sub")).toBe(true);
    expect(fileTreeStore.children.get("/root/sub")?.map((e) => e.path)).toContain("/root/sub/deep.md");
    expect(computeTreeRows().some((r) => r.entry.path === "/root/sub/deep.md")).toBe(true);
  });

  it("revealPath re-expands a collapsed root", async () => {
    mockedListDirectory.mockResolvedValue([entry("a.md")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    collapseAll();

    const found = await revealPath("/root/a.md");

    expect(found).toBe(true);
    expect(isExpanded("/root")).toBe(true);
  });

  it("revealPath returns false for paths outside the root without expanding", async () => {
    setRoot("/root");
    const found = await revealPath("/other/file.md");

    expect(found).toBe(false);
    expect(computeTreeRows().some((r) => r.entry.path === "/other/file.md")).toBe(false);
  });

  it("revealPath waits for an in-flight root load before revealing", async () => {
    let resolveLoad: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockImplementation((path: string) => {
      if (path === "/root") {
        return new Promise<FileEntry[]>((resolve) => {
          resolveLoad = resolve;
        });
      }
      return Promise.resolve([entry("a.md")]);
    });

    // A root change (e.g. follow mode) started a load that is still in flight.
    setRoot("/root");
    const pendingRootLoad = loadChildren("/root");
    let found = false;
    const reveal = revealPath("/root/a.md").then((f) => {
      found = f;
    });

    resolveLoad([entry("a.md")]);
    await pendingRootLoad;
    await reveal;

    expect(found).toBe(true);
  });

  it("revealPath returns false when the target is filtered by markdown-only mode", async () => {
    mockedListDirectory.mockResolvedValue([entry("notes.txt")]);
    setRoot("/root");
    await vi.waitFor(() => expect(fileTreeStore.children.has("/root")).toBe(true));
    settingsState.fileTreeShowMarkdownOnly = true;

    const found = await revealPath("/root/notes.txt");

    expect(found).toBe(false);
  });
});
