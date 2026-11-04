import { translate } from "$lib/i18n";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { getCurrentTimestamp } from "$lib/utils/date";
import { AppError } from "$lib/utils/errorHandling";
import { appState } from "./appState.svelte";
import { editorStore } from "./editorStoreCore.svelte";

export type Bookmark = {
  id: string;
  path: string;
  title: string;
  tags: string[];
  created: string;
  last_accessed: string | null;
};

// State
export const bookmarkStore = $state({
  bookmarks: [] as Bookmark[],
  isLoaded: false,
});

// Logic functions (async actions)
export async function loadBookmarks() {
  const bookmarks = await callBackend("get_all_bookmarks", {}, "Database:Init", undefined, {
    ignore: true,
  });
  bookmarkStore.bookmarks = bookmarks || [];
  bookmarkStore.isLoaded = true;
}

export async function addBookmark(
  path: string,
  title: string,
  tags: string[] = [],
): Promise<{ bookmark: Bookmark; isNew: boolean }> {
  const existing = bookmarkStore.bookmarks.find((b) => b.path === path);
  if (existing) return { bookmark: existing, isNew: false };

  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    path,
    title,
    tags,
    created: getCurrentTimestamp(),
    last_accessed: null,
  };

  bookmarkStore.bookmarks.unshift(bookmark);
  try {
    await callBackend("add_bookmark", { bookmark }, "Bookmark:Add");
  } catch (err) {
    // The optimistic row never reached SQLite; reload instead of showing a
    // bookmark that disappears on the next launch.
    await loadBookmarks();
    AppError.handle("Bookmark:Add", err, { showToast: true });
    return { bookmark, isNew: false };
  }
  return { bookmark, isNew: true };
}

export async function deleteBookmark(id: string) {
  bookmarkStore.bookmarks = bookmarkStore.bookmarks.filter((b) => b.id !== id);
  try {
    await callBackend("delete_bookmark", { id }, "Bookmark:Remove");
  } catch (err) {
    // A failed delete leaves the row in SQLite; re-read so the UI matches it.
    await loadBookmarks();
    AppError.handle("Bookmark:Remove", err, { showToast: true });
  }
}

export function pruneBookmarks(paths: string[]) {
  const removed = new Set(paths);
  bookmarkStore.bookmarks = bookmarkStore.bookmarks.filter((b) => !removed.has(b.path));
}

/** Delete the bookmarks at or inside `path` (a deleted file or folder), on disk and in memory. */
export async function pruneBookmarksUnder(path: string): Promise<void> {
  const prefix = `${path}/`;
  const doomed = bookmarkStore.bookmarks.filter((b) => b.path === path || b.path.startsWith(prefix));
  await Promise.all(doomed.map((b) => deleteBookmark(b.id)));
}

export async function updateBookmark(id: string, title: string, tags: string[], path?: string) {
  const existing = bookmarkStore.bookmarks.find((b) => b.id === id);
  if (!existing) return;

  const updated: Bookmark = { ...existing, title, tags, path: path ?? existing.path };

  // A rename can land on a path another bookmark still holds. The UNIQUE path
  // plus INSERT OR REPLACE makes the database drop that row, so only the local
  // copy needs removing; deleting it first would lose both if the write fails.
  bookmarkStore.bookmarks = bookmarkStore.bookmarks.filter((b) => b.id === id || b.path !== updated.path);

  try {
    await callBackend("add_bookmark", { bookmark: updated }, "Bookmark:Add");
  } catch (err) {
    // The old row is still in SQLite and the new one was not written; reload
    // rather than dropping the bookmark from the list for the whole session.
    await loadBookmarks();
    AppError.handle("Bookmark:Add", err, { showToast: true });
    return;
  }
  const index = bookmarkStore.bookmarks.findIndex((b) => b.id === id);
  if (index !== -1) bookmarkStore.bookmarks[index] = updated;
}

export async function updateAccessTime(id: string) {
  const lastAccessed = getCurrentTimestamp();
  // fire and forget, ignore errors
  callBackend("update_bookmark_access_time", { id, lastAccessed }, "File:Read", undefined, {
    ignore: true,
  });

  const index = bookmarkStore.bookmarks.findIndex((b) => b.id === id);
  if (index !== -1) {
    bookmarkStore.bookmarks[index].last_accessed = lastAccessed;
  }
}

// Logic functions (selectors)
export function isBookmarked(path: string): boolean {
  return bookmarkStore.bookmarks.some((b) => b.path === path);
}

export function getBookmarkByPath(path: string): Bookmark | undefined {
  return bookmarkStore.bookmarks.find((b) => b.path === path);
}

export function addBookmarkForActiveTab(): boolean {
  const tab = editorStore.tabs.find((t) => t.id === appState.activeTabId);
  if (tab?.path) {
    addBookmark(tab.path, tab.title).then(({ bookmark, isNew }) => {
      // A failed write reloaded the list and already showed an error, so the
      // row is gone; do not report success or "already bookmarked" for it.
      if (!bookmarkStore.bookmarks.some((b) => b.id === bookmark.id)) return;
      if (!isNew) showToast("info", translate("bookmarks.alreadyToast", { values: { title: tab.title } }));
    });
  } else {
    showToast("warning", translate("bookmarks.saveFirst"));
  }
  return true;
}
