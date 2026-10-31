import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

import { callBackend } from "$lib/utils/backend";
import { type Bookmark, bookmarkStore, pruneBookmarksUnder, updateBookmark } from "./bookmarkStore.svelte";

const mockedCallBackend = vi.mocked(callBackend);

function makeBookmark(overrides: Partial<Bookmark>): Bookmark {
  return {
    id: "b1",
    path: "/a.md",
    title: "A",
    tags: [],
    created: "2026-01-01",
    last_accessed: null,
    ...overrides,
  };
}

describe("updateBookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookmarkStore.bookmarks = [
      makeBookmark({ id: "b1", path: "/old.md" }),
      makeBookmark({ id: "b2", path: "/new.md" }),
    ];
  });

  it("replaces the bookmark that still holds the new path without deleting it first", async () => {
    await updateBookmark("b1", "Renamed", [], "/new.md");

    expect(mockedCallBackend.mock.calls.some(([command]) => command === "delete_bookmark")).toBe(false);
    const added = mockedCallBackend.mock.calls.find(([command]) => command === "add_bookmark");
    expect(added?.[1]).toEqual({
      bookmark: expect.objectContaining({ id: "b1", path: "/new.md", title: "Renamed" }),
    });
    expect(bookmarkStore.bookmarks).toHaveLength(1);
    expect(bookmarkStore.bookmarks[0]).toMatchObject({ id: "b1", path: "/new.md", title: "Renamed" });
  });

  it("leaves other bookmarks alone when the path is unchanged", async () => {
    await updateBookmark("b1", "Renamed", []);

    expect(mockedCallBackend.mock.calls.some(([command]) => command === "delete_bookmark")).toBe(false);
    expect(bookmarkStore.bookmarks).toHaveLength(2);
  });
});

describe("pruneBookmarksUnder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookmarkStore.bookmarks = [
      makeBookmark({ id: "b1", path: "/docs" }),
      makeBookmark({ id: "b2", path: "/docs/a.md" }),
      makeBookmark({ id: "b3", path: "/docs-old/b.md" }),
      makeBookmark({ id: "b4", path: "/other.md" }),
    ];
  });

  it("removes the deleted folder and its children, but not a sibling with the same prefix", async () => {
    await pruneBookmarksUnder("/docs");

    expect(bookmarkStore.bookmarks.map((b) => b.id)).toEqual(["b3", "b4"]);
    const deletedCalls = mockedCallBackend.mock.calls.filter(([command]) => command === "delete_bookmark");
    expect(deletedCalls.map((call) => call[1])).toEqual([{ id: "b1" }, { id: "b2" }]);
  });
});
