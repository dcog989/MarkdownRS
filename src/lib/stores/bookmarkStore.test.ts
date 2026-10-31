import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

import { callBackend } from "$lib/utils/backend";
import { type Bookmark, bookmarkStore, updateBookmark } from "./bookmarkStore.svelte";

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
