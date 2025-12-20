import { invoke } from "@tauri-apps/api/core";

export type Bookmark = {
    id: string;
    path: string;
    title: string;
    tags: string[];
    created: string;
    last_accessed: string | null;
};

function getCurrentTimestamp(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const MM = String(d.getMinutes()).padStart(2, '0');
    const SS = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd} / ${HH}${MM}${SS}`;
}

export class BookmarkStore {
    bookmarks = $state<Bookmark[]>([]);
    isLoaded = $state(false);

    async loadBookmarks() {
        try {
            const bookmarks = await invoke<Bookmark[]>("get_all_bookmarks");
            this.bookmarks = bookmarks;
            this.isLoaded = true;
        } catch (error) {
            console.error("Failed to load bookmarks:", error);
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
            await invoke("add_bookmark", { bookmark });
            this.bookmarks = [bookmark, ...this.bookmarks];
            return bookmark;
        } catch (error) {
            console.error("Failed to add bookmark:", error);
            throw error;
        }
    }

    async deleteBookmark(id: string) {
        try {
            await invoke("delete_bookmark", { id });
            this.bookmarks = this.bookmarks.filter(b => b.id !== id);
        } catch (error) {
            console.error("Failed to delete bookmark:", error);
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
            await invoke("add_bookmark", { bookmark: updated });
            const index = this.bookmarks.findIndex(b => b.id === id);
            if (index !== -1) {
                const newBookmarks = [...this.bookmarks];
                newBookmarks[index] = updated;
                this.bookmarks = newBookmarks;
            }
        } catch (error) {
            console.error("Failed to update bookmark:", error);
            throw error;
        }
    }

    async updateAccessTime(id: string) {
        const lastAccessed = getCurrentTimestamp();
        try {
            await invoke("update_bookmark_access_time", { id, lastAccessed });
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
            console.error("Failed to update access time:", error);
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
