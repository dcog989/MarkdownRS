import { callBackend } from "$lib/utils/backend";
import { getCurrentTimestamp } from "$lib/utils/date";

export type Bookmark = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    created: string;
    last_accessed: string | null;
};

export class BookmarkStore {
    bookmarks = $state<Bookmark[]>([]);
    isLoaded = $state(false);

    async loadBookmarks() {
        try {
            const bookmarks = await callBackend("get_all_bookmarks", {}, "Database:Init");
            this.bookmarks = bookmarks;
            this.isLoaded = true;
        } catch (error) {
            this.bookmarks = [];
            this.isLoaded = true;
        }
    }

    async addBookmark(path: string, title: string, tags: string[] = []) {
        const bookmark: Bookmark = {
            id: crypto.randomUUID(),
            path,
            title,
            tags,
            created: getCurrentTimestamp(),
            last_accessed: null
        };

        try {
            await callBackend("add_bookmark", { bookmark }, "File:Read");
            this.bookmarks = [bookmark, ...this.bookmarks];
            return bookmark;
        } catch (error) {
            throw error;
        }
    }

    async deleteBookmark(id: string) {
        try {
            await callBackend("delete_bookmark", { id }, "File:Write");
            this.bookmarks = this.bookmarks.filter(b => b.id !== id);
        } catch (error) {
            throw error;
        }
    }

    async updateBookmark(id: string, title: string, tags: string[]) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (!bookmark) return;

        const updated: Bookmark = {
            ...bookmark,
            title,
            tags
        };

        try {
            await callBackend("add_bookmark", { bookmark: updated }, "File:Write");
            const index = this.bookmarks.findIndex(b => b.id === id);
            if (index !== -1) {
                const newBookmarks = [...this.bookmarks];
                newBookmarks[index] = updated;
                this.bookmarks = newBookmarks;
            }
        } catch (error) {
            throw error;
        }
    }

    async updateAccessTime(id: string) {
        const lastAccessed = getCurrentTimestamp();
        try {
            await callBackend("update_bookmark_access_time", { id, lastAccessed }, "File:Read");
            const bookmark = this.bookmarks.find(b => b.id === id);
            if (bookmark) {
                const index = this.bookmarks.findIndex(b => b.id === id);
                if (index !== -1) {
                    const newBookmarks = [...this.bookmarks];
                    newBookmarks[index] = { ...bookmark, last_accessed: lastAccessed };
                    this.bookmarks = newBookmarks;
                }
            }
        } catch (error) {
            // Error logged by bridge
        }
    }

    isBookmarked(path: string): boolean {
        return this.bookmarks.some(b => b.path === path);
    }

    getBookmark(path: string): Bookmark | undefined {
        return this.bookmarks.find(b => b.path === path);
    }
}

export const bookmarkStore = new BookmarkStore();
