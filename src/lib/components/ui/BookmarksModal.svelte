<script lang="ts">
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { callBackend } from "$lib/utils/backend";
    import { open } from "@tauri-apps/plugin-dialog";
    import { ArrowDown, ArrowUp, Bookmark as BookmarkIcon, Pen, Plus, Search, Tag, Trash2, X } from "lucide-svelte";
    import Modal from "./Modal.svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onOpenFile: (path: string) => void;
    }

    let { isOpen = $bindable(false), onClose, onOpenFile }: Props = $props();

    type SortOption = "most-recent" | "alphabetical" | "last-updated";
    type SortDirection = "asc" | "desc";

    let searchQuery = $state("");
    let searchInputEl = $state<HTMLInputElement>();
    let editingId = $state<string | null>(null);
    let editTitle = $state("");
    let editTags = $state("");
    let showAddForm = $state(false);
    let addPath = $state("");
    let addTitle = $state("");
    let addTags = $state("");
    let browseError = $state("");
    let sortBy = $state<SortOption>("most-recent");
    let sortDirection = $state<SortDirection>("desc");

    $effect(() => {
        if (isOpen && !appContext.bookmarks.isLoaded) {
            appContext.bookmarks.loadBookmarks();
        }
        if (!isOpen) {
            searchQuery = "";
            editingId = null;
            showAddForm = false;
            browseError = "";
        }
        if (isOpen) {
            setTimeout(() => searchInputEl?.focus(), 0);
        }
    });

    let filteredBookmarks = $derived(
        appContext.bookmarks.bookmarks.filter((bookmark) => {
            if (searchQuery.length < 2) return true;
            const query = searchQuery.toLowerCase();
            const titleMatch = bookmark.title.toLowerCase().includes(query);
            const pathMatch = bookmark.path.toLowerCase().includes(query);
            const tagsMatch = bookmark.tags.some((tag) => tag.toLowerCase().includes(query));
            return titleMatch || pathMatch || tagsMatch;
        })
    );

    let sortedBookmarks = $derived(
        (() => {
            const sorted = [...filteredBookmarks];
            switch (sortBy) {
                case "most-recent":
                    sorted.sort((a, b) => {
                        const dateA = a.created || "";
                        const dateB = b.created || "";
                        return sortDirection === "desc" ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
                    });
                    break;
                case "alphabetical":
                    sorted.sort((a, b) => {
                        const titleA = a.title.toLowerCase();
                        const titleB = b.title.toLowerCase();
                        return sortDirection === "desc" ? titleB.localeCompare(titleA) : titleA.localeCompare(titleB);
                    });
                    break;
                case "last-updated":
                    sorted.sort((a, b) => {
                        const dateA = a.last_accessed || a.created || "";
                        const dateB = b.last_accessed || b.created || "";
                        return sortDirection === "desc" ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
                    });
                    break;
            }
            return sorted;
        })()
    );

    async function handleOpenBookmark(bookmark: (typeof appContext.bookmarks.bookmarks)[0]) {
        await appContext.bookmarks.updateAccessTime(bookmark.id);
        onOpenFile(bookmark.path);
        onClose();
    }

    function startEdit(bookmark: (typeof appContext.bookmarks.bookmarks)[0]) {
        editingId = bookmark.id;
        editTitle = bookmark.title;
        editTags = bookmark.tags.join(", ");
    }

    function cancelEdit() {
        editingId = null;
        editTitle = "";
        editTags = "";
    }

    async function saveEdit(id: string) {
        const tags = editTags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        await appContext.bookmarks.updateBookmark(id, editTitle, tags);
        editingId = null;
        editTitle = "";
        editTags = "";
    }

    async function handleDelete(id: string, e: MouseEvent) {
        e.stopPropagation();
        await appContext.bookmarks.deleteBookmark(id);
    }

    function startAdd() {
        showAddForm = true;
        addPath = "";
        addTitle = "";
        addTags = "";
        browseError = "";
    }

    async function handleBrowse() {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: "Markdown Files", extensions: ["md", "markdown", "txt"] }],
            });
            if (selected && typeof selected === "string") {
                addPath = selected;
                browseError = "";
                const filename = selected.split(/[\\/]/).pop() || "";
                const titleWithoutExt = filename.replace(/\.[^/.]+$/, "");
                if (!addTitle) addTitle = titleWithoutExt;
            }
        } catch (error) {
            browseError = "Failed to open file browser";
        }
    }

    async function handleAddBookmark() {
        if (!addPath || !addTitle) return;
        try {
            await callBackend("get_file_metadata", { path: addPath }, "File:Metadata");
        } catch (error) {
            browseError = "File does not exist or cannot be accessed";
            return;
        }
        if (appContext.bookmarks.isBookmarked(addPath)) {
            browseError = "This file is already bookmarked";
            return;
        }
        const tags = addTags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        await appContext.bookmarks.addBookmark(addPath, addTitle, tags);
        showAddForm = false;
        addPath = "";
        addTitle = "";
        addTags = "";
        browseError = "";
    }

    function formatDate(timestamp: string | null): string {
        if (!timestamp) return "Never";
        const [date] = timestamp.split(" / ");
        return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <BookmarkIcon size={16} class="text-accent-secondary" />
            <h2 class="text-ui font-semibold shrink-0 text-fg-default">Bookmarks</h2>
        </div>

        <div class="flex-1 relative mx-4">
            <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
            <input bind:this={searchInputEl} bind:value={searchQuery} type="text" placeholder="Search bookmarks..." class="w-full pl-8 pr-3 py-1 rounded outline-none text-ui bg-bg-input text-fg-default border border-border-main focus:border-accent-primary transition-colors" />
        </div>

        <div class="flex items-center gap-1 shrink-0">
            <select bind:value={sortBy} class="px-2 py-1 rounded text-ui outline-none cursor-pointer bg-bg-input text-fg-default border border-border-main">
                <option value="most-recent">Most Recent</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="last-updated">Last Updated</option>
            </select>
            <button onclick={toggleSortDirection} class="p-1 rounded hover:bg-white/10 transition-colors text-fg-muted" title={sortDirection === "asc" ? "Sort Ascending" : "Sort Descending"}>
                {#if sortDirection === "asc"}
                    <ArrowUp size={16} />
                {:else}
                    <ArrowDown size={16} />
                {/if}
            </button>
        </div>

        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 ml-2 text-accent-primary" onclick={startAdd} title="Add Bookmark">
            <Plus size={16} />
        </button>

        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 ml-2 text-fg-muted" onclick={onClose}>
            <X size={16} />
        </button>
    {/snippet}

    {#if showAddForm}
        <div class="px-4 py-3 border-b bg-bg-input border-border-main">
            <div class="space-y-2">
                <div class="flex gap-2">
                    <input bind:value={addPath} type="text" placeholder="File path..." class="flex-1 px-2 py-1 rounded text-ui outline-none border bg-bg-panel text-fg-default border-border-main" />
                    <button onclick={handleBrowse} class="px-3 py-1 rounded text-ui font-medium transition-colors bg-bg-panel text-fg-default border border-border-main"> Browse... </button>
                </div>
                <input bind:value={addTitle} type="text" placeholder="Bookmark title..." class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-panel text-fg-default border-border-main" />
                <input bind:value={addTags} type="text" placeholder="Tags (comma-separated)..." class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-panel text-fg-default border-border-main" />
                {#if browseError}
                    <div class="text-ui-sm text-danger-text">{browseError}</div>
                {/if}
                <div class="flex gap-2 justify-end">
                    <button onclick={() => (showAddForm = false)} class="px-3 py-1 rounded text-ui">Cancel</button>
                    <button onclick={handleAddBookmark} disabled={!addPath || !addTitle} class="px-3 py-1 rounded text-ui font-medium disabled:opacity-50 bg-accent-primary text-fg-inverse">Add</button>
                </div>
            </div>
        </div>
    {/if}

    <div class="text-ui">
        {#if sortedBookmarks.length > 0}
            <div class="divide-y border-border-main">
                {#each sortedBookmarks as bookmark (bookmark.id)}
                    <div class="px-4 py-2.5 hover:bg-white/5 transition-colors">
                        {#if editingId === bookmark.id}
                            <div class="space-y-2">
                                <input bind:value={editTitle} type="text" class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-input text-fg-default border-border-main" />
                                <input bind:value={editTags} type="text" placeholder="Tags (comma-separated)" class="w-full px-2 py-1 rounded text-ui outline-none border bg-bg-input text-fg-default border-border-main" />
                                <div class="flex gap-2 justify-end">
                                    <button onclick={cancelEdit} class="px-2 py-1 rounded text-ui-sm">Cancel</button>
                                    <button onclick={() => saveEdit(bookmark.id)} class="px-2 py-1 rounded text-ui-sm bg-accent-primary text-fg-inverse">Save</button>
                                </div>
                            </div>
                        {:else}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div class="flex items-start gap-3 cursor-pointer" onclick={() => handleOpenBookmark(bookmark)}>
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium truncate text-fg-default">
                                        {bookmark.title}
                                    </div>
                                    <div class="text-ui-sm opacity-60 truncate text-fg-muted">
                                        {bookmark.path}
                                    </div>
                                    {#if bookmark.tags.length > 0}
                                        <div class="flex items-center gap-1 mt-1 flex-wrap">
                                            <Tag size={12} class="opacity-50" />
                                            {#each bookmark.tags as tag}
                                                <span class="text-ui-sm px-1.5 py-0.5 rounded bg-bg-input text-fg-muted">
                                                    {tag}
                                                </span>
                                            {/each}
                                        </div>
                                    {/if}
                                    <div class="text-ui-sm opacity-50 mt-1 text-fg-muted">
                                        Added: {formatDate(bookmark.created)}
                                        {#if bookmark.last_accessed}
                                            • Accessed: {formatDate(bookmark.last_accessed)}
                                        {/if}
                                    </div>
                                </div>
                                <div class="flex gap-1 shrink-0">
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            startEdit(bookmark);
                                        }}
                                        class="p-1.5 rounded hover:bg-white/10 text-fg-muted"
                                    >
                                        <Pen size={14} />
                                    </button>
                                    <button onclick={(e) => handleDelete(bookmark.id, e)} class="p-1.5 rounded hover:bg-white/10 text-danger-text">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else if searchQuery.length >= 2}
            <div class="px-4 py-8 text-center text-fg-muted">No bookmarks match your search</div>
        {:else if appContext.bookmarks.bookmarks.length === 0}
            <div class="px-4 py-8 text-center text-fg-muted">
                <BookmarkIcon size={48} class="mx-auto mb-2 opacity-30" />
                <div class="mb-1">No bookmarks yet</div>
                <div class="text-ui-sm opacity-70">Click the + button above to add your first bookmark</div>
            </div>
        {/if}
    </div>
</Modal>
