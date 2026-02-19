import { callBackend } from '$lib/utils/backend';
import { getCurrentTimestamp } from '$lib/utils/date';

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
    const bookmarks = await callBackend('get_all_bookmarks', {}, 'Database:Init', undefined, {
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
    await callBackend('add_bookmark', { bookmark }, 'Bookmark:Add', undefined, { report: true });
    return { bookmark, isNew: true };
}

export async function deleteBookmark(id: string) {
    bookmarkStore.bookmarks = bookmarkStore.bookmarks.filter((b) => b.id !== id);
    await callBackend('delete_bookmark', { id }, 'Bookmark:Remove', undefined, { report: true });
}

export async function updateBookmark(id: string, title: string, tags: string[], path?: string) {
    const index = bookmarkStore.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return;

    const updated: Bookmark = {
        ...bookmarkStore.bookmarks[index],
        title,
        tags,
        path: path ?? bookmarkStore.bookmarks[index].path,
    };

    await callBackend('add_bookmark', { bookmark: updated }, 'Bookmark:Add', undefined, {
        report: true,
    });
    bookmarkStore.bookmarks[index] = updated;
}

export async function updateAccessTime(id: string) {
    const lastAccessed = getCurrentTimestamp();
    // fire and forget, ignore errors
    callBackend('update_bookmark_access_time', { id, lastAccessed }, 'File:Read', undefined, {
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
