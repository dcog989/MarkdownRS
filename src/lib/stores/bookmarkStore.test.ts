import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/utils/backend", () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

// The real state tree pulls in the whole app; this module only reads it from
// `addBookmarkForActiveTab`, which these tests do not exercise.
vi.mock("$lib/stores/state.svelte", () => ({ appContext: {} }));

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

  it("deletes the bookmark that still holds the new path", async () => {
    await updateBookmark("b1", "Renamed", [], "/new.md");

    const deleted = mockedCallBackend.mock.calls.find(([command]) => command === "delete_bookmark");
    expect(deleted?.[1]).toEqual({ id: "b2" });
    expect(bookmarkStore.bookmarks).toHaveLength(1);
    expect(bookmarkStore.bookmarks[0]).toMatchObject({ id: "b1", path: "/new.md", title: "Renamed" });
  });

  it("leaves other bookmarks alone when the path is unchanged", async () => {
    await updateBookmark("b1", "Renamed", []);

    expect(mockedCallBackend.mock.calls.some(([command]) => command === "delete_bookmark")).toBe(false);
    expect(bookmarkStore.bookmarks).toHaveLength(2);
  });
});
