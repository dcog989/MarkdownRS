<script lang="ts">
    import Input from '$lib/components/ui/Input.svelte';
    import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
    import {
        addBookmark,
        deleteBookmark,
        isBookmarked,
        loadBookmarks,
        updateAccessTime,
        updateBookmark,
    } from '$lib/stores/bookmarkStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { callBackend } from '$lib/utils/backend';
    import { scrollIntoView } from '$lib/utils/modalUtils';
    import { open } from '@tauri-apps/plugin-dialog';
    import {
        ArrowDown,
        ArrowUp,
        Bookmark as BookmarkIcon,
        Pen,
        Plus,
        Tag,
        Trash2,
    } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onOpenFile: (path: string) => void;
        position?: 'center' | 'top';
    }

    let { isOpen = $bindable(false), onClose, onOpenFile, position = 'top' }: Props = $props();

    type SortOption = 'most-recent' | 'alphabetical' | 'last-updated';
    type SortDirection = 'asc' | 'desc';

    let searchQuery = $state('');
    let searchInputEl = $state<HTMLInputElement>();
    let selectedIndex = $state(0);
    let editingId = $state<string | null>(null);
    let editTitle = $state('');
    let editTags = $state('');
    let showAddForm = $state(false);
    let addPath = $state('');
    let addTitle = $state('');
    let addTags = $state('');
    let browseError = $state('');
    let sortBy = $state<SortOption>('most-recent');
    let sortDirection = $state<SortDirection>('desc');

    $effect(() => {
        if (isOpen && !appContext.bookmarks.isLoaded) {
            loadBookmarks();
        }
        if (!isOpen) {
            searchQuery = '';
            selectedIndex = 0;
            editingId = null;
            showAddForm = false;
            browseError = '';
        }
        if (isOpen) {
            setTimeout(() => searchInputEl?.focus(), 0);
        }
    });

    // Reset selection when search query or sort changes
    $effect(() => {
        void searchQuery;
        void sortBy;
        void sortDirection;
        selectedIndex = 0;
    });

    let filteredBookmarks = $derived(
        appContext.bookmarks.bookmarks.filter((bookmark) => {
            if (searchQuery.length < 2) return true;
            const query = searchQuery.toLowerCase();
            const titleMatch = bookmark.title.toLowerCase().includes(query);
            const pathMatch = bookmark.path.toLowerCase().includes(query);
            const tagsMatch = bookmark.tags.some((tag) => tag.toLowerCase().includes(query));
            return titleMatch || pathMatch || tagsMatch;
        }),
    );

    let sortedBookmarks = $derived(
        (() => {
            const sorted = [...filteredBookmarks];
            switch (sortBy) {
                case 'most-recent':
                    sorted.sort((a, b) => {
                        const dateA = a.created || '';
                        const dateB = b.created || '';
                        return sortDirection === 'desc'
                            ? dateB.localeCompare(dateA)
                            : dateA.localeCompare(dateB);
                    });
                    break;
                case 'alphabetical':
                    sorted.sort((a, b) => {
                        const titleA = a.title.toLowerCase();
                        const titleB = b.title.toLowerCase();
                        return sortDirection === 'desc'
                            ? titleB.localeCompare(titleA)
                            : titleA.localeCompare(titleB);
                    });
                    break;
                case 'last-updated':
                    sorted.sort((a, b) => {
                        const dateA = a.last_accessed || a.created || '';
                        const dateB = b.last_accessed || b.created || '';
                        return sortDirection === 'desc'
                            ? dateB.localeCompare(dateA)
                            : dateA.localeCompare(dateB);
                    });
                    break;
            }
            return sorted;
        })(),
    );

    async function handleOpenBookmark(bookmark: (typeof appContext.bookmarks.bookmarks)[0]) {
        await updateAccessTime(bookmark.id);
        onOpenFile(bookmark.path);
        onClose();
    }

    function startEdit(bookmark: (typeof appContext.bookmarks.bookmarks)[0]) {
        editingId = bookmark.id;
        editTitle = bookmark.title;
        editTags = bookmark.tags.join(', ');
    }

    function cancelEdit() {
        editingId = null;
        editTitle = '';
        editTags = '';
    }

    async function saveEdit(id: string) {
        const tags = editTags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        await updateBookmark(id, editTitle, tags);
        editingId = null;
        editTitle = '';
        editTags = '';
    }

    async function handleDelete(id: string, e: MouseEvent) {
        e.stopPropagation();
        await deleteBookmark(id);
    }

    function startAdd() {
        showAddForm = true;
        addPath = '';
        addTitle = '';
        addTags = '';
        browseError = '';
    }

    async function handleBrowse() {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] }],
            });
            if (selected && typeof selected === 'string') {
                addPath = selected;
                browseError = '';
                const filename = selected.split(/[\\/]/).pop() || '';
                const titleWithoutExt = filename.replace(/\.[^/.]+$/, '');
                if (!addTitle) addTitle = titleWithoutExt;
            }
        } catch (_error) {
            browseError = 'Failed to open file browser';
        }
    }

    async function handleAddBookmark() {
        if (!addPath || !addTitle) return;
        try {
            await callBackend('get_file_metadata', { path: addPath }, 'File:Metadata');
        } catch (_error) {
            browseError = 'File does not exist or cannot be accessed';
            return;
        }
        if (isBookmarked(addPath)) {
            browseError = 'This file is already bookmarked';
            return;
        }
        const tags = addTags
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        await addBookmark(addPath, addTitle, tags);
        showAddForm = false;
        addPath = '';
        addTitle = '';
        addTags = '';
        browseError = '';
    }

    function formatDate(timestamp: string | null): string {
        if (!timestamp) return 'Never';
        const [date] = timestamp.split(' / ');
        return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }

    function handleKeydown(e: KeyboardEvent) {
        if (sortedBookmarks.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % sortedBookmarks.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + sortedBookmarks.length) % sortedBookmarks.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const bookmark = sortedBookmarks[selectedIndex];
            if (bookmark && editingId !== bookmark.id) {
                handleOpenBookmark(bookmark);
            }
        }
    }
</script>

<Modal bind:isOpen {onClose} {position}>
    {#snippet header()}
        <ModalSearchHeader
            title="Bookmarks"
            icon={BookmarkIcon}
            bind:searchValue={searchQuery}
            bind:inputRef={searchInputEl}
            searchPlaceholder="Search bookmarks..."
            {onClose}
            onKeydown={handleKeydown}>
            {#snippet extraActions()}
                <div class="flex shrink-0 items-center gap-1">
                    <select
                        bind:value={sortBy}
                        class="text-xs bg-bg-input text-fg-default bg-border-main cursor-pointer rounded border pl-1 pr-5 py-1 outline-none w-auto">
                        <option value="most-recent">Most Recent</option>
                        <option value="alphabetical">Alphabetical</option>
                        <option value="last-updated">Last Updated</option>
                    </select>
                    <button
                        onclick={toggleSortDirection}
                        class="text-fg-muted hover-surface rounded p-1 transition-colors"
                        title={sortDirection === 'asc' ? 'Sort Ascending' : 'Sort Descending'}>
                        {#if sortDirection === 'asc'}
                            <ArrowUp size={16} />
                        {:else}
                            <ArrowDown size={16} />
                        {/if}
                    </button>
                </div>

                <button
                    class="text-accent-primary hover-surface ml-2 shrink-0 rounded p-1 transition-colors"
                    onclick={startAdd}
                    title="Add Bookmark">
                    <Plus size={16} />
                </button>
            {/snippet}
        </ModalSearchHeader>
    {/snippet}

    {#if showAddForm}
        <div class="bg-bg-input bg-border-main border-b px-4 py-3">
            <div class="space-y-2">
                <div class="flex gap-2">
                    <Input
                        bind:value={addPath}
                        type="text"
                        placeholder="File path..."
                        class="bg-bg-panel flex-1" />
                    <button
                        onclick={handleBrowse}
                        class="text-ui bg-bg-panel text-fg-default bg-border-main rounded border px-3 py-1 font-medium transition-colors">
                        Browse...
                    </button>
                </div>
                <Input
                    bind:value={addTitle}
                    type="text"
                    placeholder="Bookmark title..."
                    class="bg-bg-panel" />
                <Input
                    bind:value={addTags}
                    type="text"
                    placeholder="Tags (comma-separated)..."
                    class="bg-bg-panel" />
                {#if browseError}
                    <div class="text-ui-sm text-danger-text">{browseError}</div>
                {/if}
                <div class="flex justify-end gap-2">
                    <button onclick={() => (showAddForm = false)} class="text-ui rounded px-3 py-1"
                        >Cancel</button>
                    <button
                        onclick={handleAddBookmark}
                        disabled={!addPath || !addTitle}
                        class="text-ui bg-accent-primary text-fg-inverse rounded px-3 py-1 font-medium disabled:opacity-50"
                        >Add</button>
                </div>
            </div>
        </div>
    {/if}

    <div class="text-ui">
        {#if sortedBookmarks.length > 0}
            <div class="divide-border-main divide-y">
                {#each sortedBookmarks as bookmark, index (bookmark.id)}
                    {@const isSelected = index === selectedIndex}
                    <div
                        class="px-4 py-2.5 transition-colors"
                        class:bg-row-even={index % 2 === 1 && !isSelected}
                        style:background-color={isSelected
                            ? 'var(--color-accent-primary)'
                            : index % 2 === 1
                              ? 'var(--surface-row)'
                              : 'transparent'}
                        use:scrollIntoView={isSelected}>
                        {#if editingId === bookmark.id}
                            <div class="space-y-2">
                                <Input bind:value={editTitle} type="text" />
                                <Input
                                    bind:value={editTags}
                                    type="text"
                                    placeholder="Tags (comma-separated)" />
                                <div class="flex justify-end gap-2">
                                    <button
                                        onclick={cancelEdit}
                                        class="text-ui-sm rounded px-2 py-1">Cancel</button>
                                    <button
                                        onclick={() => saveEdit(bookmark.id)}
                                        class="text-ui-sm bg-accent-primary text-fg-inverse rounded px-2 py-1"
                                        >Save</button>
                                </div>
                            </div>
                        {:else}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="flex cursor-pointer items-start gap-3"
                                onclick={() => handleOpenBookmark(bookmark)}
                                onmouseenter={() => (selectedIndex = index)}>
                                <div class="min-w-0 flex-1">
                                    <div
                                        class="truncate font-medium"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-default)'}>
                                        {bookmark.title}
                                    </div>
                                    <div
                                        class="text-ui-sm truncate"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-muted)'}
                                        style:opacity={isSelected ? 0.8 : 0.6}>
                                        {bookmark.path}
                                    </div>
                                    {#if bookmark.tags.length > 0}
                                        <div class="mt-1 flex flex-wrap items-center gap-1">
                                            <span
                                                style:color={isSelected
                                                    ? 'var(--color-fg-inverse)'
                                                    : 'currentColor'}>
                                                <Tag
                                                    size={12}
                                                    class={isSelected
                                                        ? 'opacity-70'
                                                        : 'opacity-50'} />
                                            </span>
                                            {#each bookmark.tags as tag (tag)}
                                                <span
                                                    class="text-ui-sm rounded px-1.5 py-0.5"
                                                    style:background-color={isSelected
                                                        ? 'rgba(255,255,255,0.2)'
                                                        : 'var(--surface-input)'}
                                                    style:color={isSelected
                                                        ? 'var(--color-fg-inverse)'
                                                        : 'var(--color-fg-muted)'}>
                                                    {tag}
                                                </span>
                                            {/each}
                                        </div>
                                    {/if}
                                    <div
                                        class="text-ui-sm mt-1"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-muted)'}
                                        style:opacity={isSelected ? 0.7 : 0.5}>
                                        Added: {formatDate(bookmark.created)}
                                        {#if bookmark.last_accessed}
                                            • Accessed: {formatDate(bookmark.last_accessed)}
                                        {/if}
                                    </div>
                                </div>
                                <div class="flex shrink-0 gap-1">
                                    <button
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            startEdit(bookmark);
                                        }}
                                        class="rounded p-1.5 transition-colors"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-fg-muted)'}
                                        style:background-color={isSelected
                                            ? 'rgba(255,255,255,0.15)'
                                            : 'transparent'}
                                        onmouseenter={(e) =>
                                            (e.currentTarget.style.backgroundColor = isSelected
                                                ? 'rgba(255,255,255,0.25)'
                                                : 'var(--surface-hover)')}
                                        onmouseleave={(e) =>
                                            (e.currentTarget.style.backgroundColor = isSelected
                                                ? 'rgba(255,255,255,0.15)'
                                                : 'transparent')}>
                                        <Pen size={14} />
                                    </button>
                                    <button
                                        onclick={(e) => handleDelete(bookmark.id, e)}
                                        class="rounded p-1.5 transition-colors"
                                        style:color={isSelected
                                            ? 'var(--color-fg-inverse)'
                                            : 'var(--color-danger-text)'}
                                        style:background-color={isSelected
                                            ? 'rgba(255,255,255,0.15)'
                                            : 'transparent'}
                                        onmouseenter={(e) =>
                                            (e.currentTarget.style.backgroundColor = isSelected
                                                ? 'rgba(255,255,255,0.25)'
                                                : 'var(--surface-hover)')}
                                        onmouseleave={(e) =>
                                            (e.currentTarget.style.backgroundColor = isSelected
                                                ? 'rgba(255,255,255,0.15)'
                                                : 'transparent')}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else if searchQuery.length >= 2}
            <div class="text-fg-muted px-4 py-8 text-center">No bookmarks match your search</div>
        {:else if appContext.bookmarks.bookmarks.length === 0}
            <div class="text-fg-muted px-4 py-8 text-center">
                <BookmarkIcon size={48} class="mx-auto mb-2 opacity-30" />
                <div class="mb-1">No bookmarks yet</div>
                <div class="text-ui-sm opacity-70">
                    Click the + button above to add your first bookmark
                </div>
            </div>
        {/if}
    </div>
</Modal>
