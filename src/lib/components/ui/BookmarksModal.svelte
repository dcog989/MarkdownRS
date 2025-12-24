<script lang="ts">
    import { bookmarkStore } from "$lib/stores/bookmarkStore.svelte.ts";
    import { callBackend } from "$lib/utils/backend";
    import { open } from "@tauri-apps/plugin-dialog";
    import { ArrowDown, ArrowUp, Bookmark as BookmarkIcon, Pen, Plus, Search, Tag, Trash2, X } from "lucide-svelte";

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
        if (isOpen && !bookmarkStore.isLoaded) {
            bookmarkStore.loadBookmarks();
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
        bookmarkStore.bookmarks.filter((bookmark) => {
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
                        return sortDirection === "desc" 
                            ? dateB.localeCompare(dateA)
                            : dateA.localeCompare(dateB);
                    });
                    break;
                    
                case "alphabetical":
                    sorted.sort((a, b) => {
                        const titleA = a.title.toLowerCase();
                        const titleB = b.title.toLowerCase();
                        return sortDirection === "desc"
                            ? titleB.localeCompare(titleA)
                            : titleA.localeCompare(titleB);
                    });
                    break;
                    
                case "last-updated":
                    sorted.sort((a, b) => {
                        const dateA = a.last_accessed || a.created || "";
                        const dateB = b.last_accessed || b.created || "";
                        return sortDirection === "desc"
                            ? dateB.localeCompare(dateA)
                            : dateA.localeCompare(dateB);
                    });
                    break;
            }
            
            return sorted;
        })()
    );

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" && isOpen) {
            if (editingId !== null) {
                editingId = null;
            } else if (showAddForm) {
                showAddForm = false;
            } else {
                e.preventDefault();
                onClose();
            }
        }
    }

    async function handleOpenBookmark(bookmark: (typeof bookmarkStore.bookmarks)[0]) {
        await bookmarkStore.updateAccessTime(bookmark.id);
        onOpenFile(bookmark.path);
        onClose();
    }

    function startEdit(bookmark: (typeof bookmarkStore.bookmarks)[0]) {
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
        await bookmarkStore.updateBookmark(id, editTitle, tags);
        editingId = null;
        editTitle = "";
        editTags = "";
    }

    async function handleDelete(id: string, e: MouseEvent) {
        e.stopPropagation();
        await bookmarkStore.deleteBookmark(id);
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
                filters: [
                    {
                        name: "Markdown Files",
                        extensions: ["md", "markdown", "txt"],
                    },
                ],
            });

            if (selected && typeof selected === "string") {
                addPath = selected;
                browseError = "";
                const filename = selected.split(/[\\/]/).pop() || "";
                const titleWithoutExt = filename.replace(/\.[^/.]+$/, "");
                if (!addTitle) {
                    addTitle = titleWithoutExt;
                }
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

        if (bookmarkStore.isBookmarked(addPath)) {
            browseError = "This file is already bookmarked";
            return;
        }

        const tags = addTags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        await bookmarkStore.addBookmark(addPath, addTitle, tags);
        showAddForm = false;
        addPath = "";
        addTitle = "";
        addTags = "";
        browseError = "";
    }

    function formatDate(timestamp: string | null): string {
        if (!timestamp) return "Never";
        const [date] = timestamp.split(" / ");
        const year = date.substring(0, 4);
        const month = date.substring(4, 6);
        const day = date.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    }

    function getSortLabel(option: SortOption): string {
        switch (option) {
            case "most-recent":
                return "Most Recent";
            case "alphabetical":
                return "Alphabetical";
            case "last-updated":
                return "Last Updated";
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-16" style="background-color: var(--color-bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-fit min-w-[700px] max-w-[90vw] max-h-[calc(100vh-8rem)] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);" onclick={(e) => e.stopPropagation()}>
            <div class="flex items-center gap-4 px-4 py-2 border-b" style="background-color: var(--color-bg-header); border-color: var(--color-border-light);">
                <div class="flex items-center gap-2">
                    <BookmarkIcon size={16} style="color: var(--color-accent-secondary);" />
                    <h2 class="text-ui font-semibold shrink-0" style="color: var(--color-fg-default);">Bookmarks</h2>
                </div>

                <div class="flex-1 relative">
                    <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                    <input bind:this={searchInputEl} bind:value={searchQuery} type="text" placeholder="Search bookmarks..." class="w-full pl-8 pr-3 py-1 rounded outline-none text-ui" style="background-color: var(--color-bg-input); color: var(--color-fg-default); border: 1px solid var(--color-border-main);" />
                </div>

                <div class="flex items-center gap-1 shrink-0">
                    <select 
                        bind:value={sortBy}
                        class="px-2 py-1 rounded text-ui outline-none cursor-pointer"
                        style="background-color: var(--color-bg-input); color: var(--color-fg-default); border: 1px solid var(--color-border-main);"
                    >
                        <option value="most-recent">Most Recent</option>
                        <option value="alphabetical">Alphabetical</option>
                        <option value="last-updated">Last Updated</option>
                    </select>
                    
                    <button 
                        onclick={toggleSortDirection}
                        class="p-1 rounded hover:bg-white/10 transition-colors"
                        style="color: var(--color-fg-muted);"
                        title={sortDirection === "asc" ? "Sort Ascending" : "Sort Descending"}
                    >
                        {#if sortDirection === "asc"}
                            <ArrowUp size={16} />
                        {:else}
                            <ArrowDown size={16} />
                        {/if}
                    </button>
                </div>

                <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0" style="color: var(--color-accent-primary);" onclick={startAdd} title="Add Bookmark">
                    <Plus size={16} />
                </button>

                <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0" style="color: var(--color-fg-muted);" onclick={onClose}>
                    <X size={16} />
                </button>
            </div>

            {#if showAddForm}
                <div class="px-4 py-3 border-b" style="background-color: var(--color-bg-input); border-color: var(--color-border-main);">
                    <div class="space-y-2">
                        <div class="flex gap-2">
                            <input bind:value={addPath} type="text" placeholder="File path..." class="flex-1 px-2 py-1 rounded text-ui outline-none border" style="background-color: var(--color-bg-panel); color: var(--color-fg-default); border-color: var(--color-border-main);" />
                            <button onclick={handleBrowse} class="px-3 py-1 rounded text-ui font-medium transition-colors" style="background-color: var(--color-bg-panel); color: var(--color-fg-default); border: 1px solid var(--color-border-main);"> Browse... </button>
                        </div>
                        <input bind:value={addTitle} type="text" placeholder="Bookmark title..." class="w-full px-2 py-1 rounded text-ui outline-none border" style="background-color: var(--color-bg-panel); color: var(--color-fg-default); border-color: var(--color-border-main);" />
                        <input bind:value={addTags} type="text" placeholder="Tags (comma-separated)..." class="w-full px-2 py-1 rounded text-ui outline-none border" style="background-color: var(--color-bg-panel); color: var(--color-fg-default); border-color: var(--color-border-main);" />
                        {#if browseError}
                            <div class="text-ui-sm" style="color: var(--color-danger-text);">{browseError}</div>
                        {/if}
                        <div class="flex gap-2 justify-end">
                            <button onclick={() => (showAddForm = false)} class="px-3 py-1 rounded text-ui">Cancel</button>
                            <button onclick={handleAddBookmark} disabled={!addPath || !addTitle} class="px-3 py-1 rounded text-ui font-medium disabled:opacity-50" style="background-color: var(--color-accent-primary); color: var(--color-fg-inverse);">Add</button>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="flex-1 overflow-y-auto custom-scrollbar text-ui">
                {#if sortedBookmarks.length > 0}
                    <div class="divide-y" style="border-color: var(--color-border-main);">
                        {#each sortedBookmarks as bookmark (bookmark.id)}
                            <div class="px-4 py-2.5 hover:bg-white/5 transition-colors">
                                {#if editingId === bookmark.id}
                                    <div class="space-y-2">
                                        <input bind:value={editTitle} type="text" class="w-full px-2 py-1 rounded text-ui outline-none border" style="background-color: var(--color-bg-input); color: var(--color-fg-default); border-color: var(--color-border-main);" />
                                        <input bind:value={editTags} type="text" placeholder="Tags (comma-separated)" class="w-full px-2 py-1 rounded text-ui outline-none border" style="background-color: var(--color-bg-input); color: var(--color-fg-default); border-color: var(--color-border-main);" />
                                        <div class="flex gap-2 justify-end">
                                            <button onclick={cancelEdit} class="px-2 py-1 rounded text-ui-sm">Cancel</button>
                                            <button onclick={() => saveEdit(bookmark.id)} class="px-2 py-1 rounded text-ui-sm" style="background-color: var(--color-accent-primary); color: var(--color-fg-inverse);">Save</button>
                                        </div>
                                    </div>
                                {:else}
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div class="flex items-start gap-3 cursor-pointer" onclick={() => handleOpenBookmark(bookmark)}>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-medium truncate" style="color: var(--color-fg-default);">
                                                {bookmark.title}
                                            </div>
                                            <div class="text-ui-sm opacity-60 truncate" style="color: var(--color-fg-muted);">
                                                {bookmark.path}
                                            </div>
                                            {#if bookmark.tags.length > 0}
                                                <div class="flex items-center gap-1 mt-1 flex-wrap">
                                                    <Tag size={12} class="opacity-50" />
                                                    {#each bookmark.tags as tag}
                                                        <span class="text-ui-sm px-1.5 py-0.5 rounded" style="background-color: var(--color-bg-input); color: var(--color-fg-muted);">
                                                            {tag}
                                                        </span>
                                                    {/each}
                                                </div>
                                            {/if}
                                            <div class="text-ui-sm opacity-50 mt-1" style="color: var(--color-fg-muted);">
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
                                                class="p-1.5 rounded hover:bg-white/10"
                                                style="color: var(--color-fg-muted);"
                                            >
                                                <Pen size={14} />
                                            </button>
                                            <button onclick={(e) => handleDelete(bookmark.id, e)} class="p-1.5 rounded hover:bg-white/10" style="color: var(--color-danger-text);">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else if searchQuery.length >= 2}
                    <div class="px-4 py-8 text-center" style="color: var(--color-fg-muted);">No bookmarks match your search</div>
                {:else if bookmarkStore.bookmarks.length === 0}
                    <div class="px-4 py-8 text-center" style="color: var(--color-fg-muted);">
                        <BookmarkIcon size={48} class="mx-auto mb-2 opacity-30" />
                        <div class="mb-1">No bookmarks yet</div>
                        <div class="text-ui-sm opacity-70">Click the + button above to add your first bookmark</div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
