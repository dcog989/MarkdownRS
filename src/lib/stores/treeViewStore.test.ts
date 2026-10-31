import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "$lib/types/api";
import { settingsState } from "./settingsState.svelte";

vi.mock("$lib/commands/directory", () => ({
  listDirectory: vi.fn(),
  getDirectoryMtime: vi.fn(),
}));

import { getDirectoryMtime, listDirectory } from "$lib/commands/directory";
import { fileTreeStore, treeRevision } from "./fileTreeStore.svelte";
import { applyFilter, computeTreeRows, MAX_SEARCH_DEPTH, treeViewStore } from "./treeViewStore.svelte";

const mockedListDirectory = vi.mocked(listDirectory);
const mockedGetDirectoryMtime = vi.mocked(getDirectoryMtime);

function entry(name: string, isDir = false): FileEntry {
  return {
    name,
    path: `/root/${name}`,
    is_dir: isDir,
    size: isDir ? 0 : 10,
    modified: null,
  };
}

describe("treeViewStore", () => {
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
    treeViewStore.filterRows = [];
    treeViewStore.filterLoading = false;
    mockedListDirectory.mockReset();
    mockedGetDirectoryMtime.mockReset();
  });

  it("computeTreeRows terminates and dedupes when a symlinked directory points at an ancestor", () => {
    fileTreeStore.root = "/root";
    fileTreeStore.expanded.set("/root", true);
    fileTreeStore.expanded.set("/root/sub", true);
    fileTreeStore.children.set("/root", [{ name: "sub", path: "/root/sub", is_dir: true, size: 0, modified: null }]);
    fileTreeStore.children.set("/root/sub", [
      { name: "root", path: "/root", is_dir: true, size: 0, modified: null },
      { name: "file.md", path: "/root/sub/file.md", is_dir: false, size: 1, modified: null },
    ]);

    const rows = computeTreeRows();

    const paths = rows.map((r) => r.entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/root");
    expect(paths).toContain("/root/sub");
    expect(paths).toContain("/root/sub/file.md");
    expect(paths.filter((p) => p === "/root")).toHaveLength(1);
  });

  it("computeTreeRows returns an empty list when no root is set", () => {
    expect(computeTreeRows()).toEqual([]);
  });

  it("computeTreeRows filters non-markdown files but keeps directories when markdown-only is on", () => {
    fileTreeStore.root = "/root";
    fileTreeStore.expanded.set("/root", true);
    fileTreeStore.expanded.set("/root/sub", true);
    fileTreeStore.children.set("/root", [entry("a.md"), entry("notes.txt"), entry("sub", true)]);
    fileTreeStore.children.set("/root/sub", [
      { ...entry("deep.md"), path: "/root/sub/deep.md" },
      { ...entry("deep.txt"), path: "/root/sub/deep.txt" },
    ]);
    settingsState.fileTreeShowMarkdownOnly = true;

    const rows = computeTreeRows();

    const paths = rows.map((r) => r.entry.path);
    expect(paths).toContain("/root");
    expect(paths).toContain("/root/a.md");
    expect(paths).toContain("/root/sub");
    expect(paths).toContain("/root/sub/deep.md");
    expect(paths).not.toContain("/root/notes.txt");
    expect(paths).not.toContain("/root/sub/deep.txt");
  });

  it("applyFilter keeps the root and matching files within their folder, pruning non-matching siblings", async () => {
    fileTreeStore.root = "/root";
    fileTreeStore.expanded.set("/root", true);
    fileTreeStore.expanded.set("/root/sub", true);
    fileTreeStore.children.set("/root", [entry("notes.md"), entry("config.json"), entry("sub", true)]);
    fileTreeStore.children.set("/root/sub", [
      { ...entry("deep.md"), path: "/root/sub/deep.md" },
      { ...entry("other.txt"), path: "/root/sub/other.txt" },
    ]);

    await applyFilter("deep", false);
    const paths = treeViewStore.filterRows.map((r) => r.entry.path);

    // The anchor root and the folder leading to the match stay visible.
    expect(paths).toContain("/root");
    expect(paths).toContain("/root/sub");
    expect(paths).toContain("/root/sub/deep.md");
    expect(paths).not.toContain("/root/notes.md");
    expect(paths).not.toContain("/root/config.json");
    expect(paths).not.toContain("/root/sub/other.txt");
    expect(treeViewStore.filterRows.some((r) => r.isParent)).toBe(false);
    expect(mockedListDirectory).not.toHaveBeenCalled();
  });

  it("applyFilter lists folders on demand so collapsed branches are searched", async () => {
    mockedListDirectory.mockResolvedValue([{ ...entry("deep.md"), path: "/root/sub/deep.md" }]);
    fileTreeStore.root = "/root";
    fileTreeStore.expanded.set("/root", true);
    fileTreeStore.children.set("/root", [entry("notes.md"), entry("sub", true)]);
    // '/root/sub' was never expanded, so its children are not cached yet.

    await applyFilter("deep", false);

    expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false);
    const paths = treeViewStore.filterRows.map((r) => r.entry.path);
    expect(paths).toContain("/root");
    expect(paths).toContain("/root/sub");
    expect(paths).toContain("/root/sub/deep.md");
    expect(paths).not.toContain("/root/notes.md");
  });

  it("applyFilter matches file names only, not folder names", async () => {
    fileTreeStore.root = "/root";
    fileTreeStore.expanded.set("/root", true);
    fileTreeStore.expanded.set("/root/sub", true);
    fileTreeStore.children.set("/root", [entry("notes.md"), entry("sub", true)]);
    fileTreeStore.children.set("/root/sub", [{ ...entry("deep.md"), path: "/root/sub/deep.md" }]);

    await applyFilter("sub", false);

    // No file matches "sub", so the search yields no rows.
    expect(treeViewStore.filterRows).toEqual([]);
    expect(mockedListDirectory).not.toHaveBeenCalled();
  });

  it("applyFilter lists multiple collapsed sibling folders in one search", async () => {
    mockedListDirectory.mockImplementation(async (path: string) =>
      path === "/root/a"
        ? [{ ...entry("alpha.md"), path: "/root/a/alpha.md" }]
        : path === "/root/b"
          ? [{ ...entry("beta.md"), path: "/root/b/beta.md" }]
          : [],
    );
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("a", true), entry("b", true)]);

    await applyFilter("alpha", false);

    expect(mockedListDirectory).toHaveBeenCalledWith("/root/a", false);
    expect(mockedListDirectory).toHaveBeenCalledWith("/root/b", false);
    expect(treeViewStore.filterRows.map((r) => r.entry.path)).toContain("/root/a/alpha.md");
  });

  it("applyFilter lists one folder at a time instead of starting every load at once", async () => {
    const resolvers: Array<() => void> = [];
    mockedListDirectory.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(path === "/root/a" ? [{ ...entry("alpha.md"), path: "/root/a/alpha.md" }] : []));
        }),
    );
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("a", true), entry("b", true)]);

    const search = applyFilter("alpha", false);
    await vi.waitFor(() => expect(mockedListDirectory).toHaveBeenCalledTimes(1));
    expect(mockedListDirectory).toHaveBeenLastCalledWith("/root/a", false);

    resolvers.shift()?.();
    await vi.waitFor(() => expect(mockedListDirectory).toHaveBeenCalledTimes(2));
    resolvers.shift()?.();
    await search;

    expect(treeViewStore.filterRows.map((r) => r.entry.path)).toContain("/root/a/alpha.md");
  });

  it("applyFilter does not descend into heavy folders like node_modules", async () => {
    mockedListDirectory.mockImplementation(async (path: string) =>
      path === "/root/node_modules" ? [{ ...entry("deep.md"), path: "/root/node_modules/deep.md" }] : [],
    );
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("node_modules", true)]);

    await applyFilter("deep", false);

    expect(mockedListDirectory).not.toHaveBeenCalledWith("/root/node_modules", false);
    expect(treeViewStore.filterRows).toEqual([]);
  });

  it("applyFilter stops descending when a symlinked folder points at an ancestor", async () => {
    // Every listing exposes the same folder through a longer alias path.
    mockedListDirectory.mockImplementation(async (path: string) => [
      { name: "up", path: `${path}/up`, is_dir: true, size: 0, modified: null },
      { name: "note.md", path: `${path}/note.md`, is_dir: false, size: 1, modified: null },
    ]);
    fileTreeStore.root = "/root";

    await applyFilter("note", false);

    expect(mockedListDirectory.mock.calls.length).toBeLessThanOrEqual(MAX_SEARCH_DEPTH + 1);
    expect(treeViewStore.filterRows.some((r) => r.entry.path === "/root/note.md")).toBe(true);
  });

  it("searches folders named build, which may hold user files", async () => {
    mockedListDirectory.mockImplementation(async (path: string) =>
      path === "/root/build" ? [{ ...entry("notes.md"), path: "/root/build/notes.md" }] : [],
    );
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("build", true)]);

    await applyFilter("notes", false);

    expect(mockedListDirectory).toHaveBeenCalledWith("/root/build", false);
    expect(treeViewStore.filterRows.map((r) => r.entry.path)).toContain("/root/build/notes.md");
  });

  it("applyFilter respects markdown-only mode", async () => {
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("note.md"), entry("note.txt")]);

    await applyFilter("note", true);
    const paths = treeViewStore.filterRows.map((r) => r.entry.path);

    expect(paths).toContain("/root/note.md");
    expect(paths).not.toContain("/root/note.txt");
  });

  it("applyFilter drops results when the tree changes while the walk is running", async () => {
    let resolveLoad: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockImplementation(
      () =>
        new Promise<FileEntry[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("sub", true)]);

    const search = applyFilter("deep", false);
    await vi.waitFor(() => expect(mockedListDirectory).toHaveBeenCalledWith("/root/sub", false));

    // The row was renamed or deleted while the walk was in flight.
    treeRevision.value++;
    resolveLoad([{ ...entry("deep.md"), path: "/root/sub/deep.md" }]);
    await search;

    expect(treeViewStore.filterRows).toEqual([]);
  });

  it("clearing the filter frees the listings the search loaded", async () => {
    mockedListDirectory.mockResolvedValue([{ ...entry("deep.md"), path: "/root/sub/deep.md" }]);
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("sub", true)]);

    await applyFilter("deep", false);
    expect(fileTreeStore.children.has("/root/sub")).toBe(true);

    await applyFilter("", false);

    expect(fileTreeStore.children.has("/root/sub")).toBe(false);
    expect(treeViewStore.filterRows).toEqual([]);
  });

  it("applyFilter clears results for an empty or whitespace query", async () => {
    fileTreeStore.root = "/root";
    fileTreeStore.children.set("/root", [entry("notes.md")]);

    await applyFilter("", false);
    expect(treeViewStore.filterRows).toEqual([]);

    await applyFilter("   ", false);
    expect(treeViewStore.filterRows).toEqual([]);
    expect(treeViewStore.filterLoading).toBe(false);
    expect(mockedListDirectory).not.toHaveBeenCalled();
  });
});
