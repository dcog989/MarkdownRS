<script lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowDown, ArrowUp, Bookmark, Pen, Plus, Tag, Trash2 } from "lucide-svelte";
import { slide } from "svelte/transition";
import { _ } from "svelte-i18n";
import Input from "$lib/components/ui/Input.svelte";
import Modal from "$lib/components/ui/Modal.svelte";
import ModalSearchHeader from "$lib/components/ui/ModalSearchHeader.svelte";
import { translate } from "$lib/i18n";
import {
  addBookmark,
  deleteBookmark,
  isBookmarked,
  loadBookmarks,
  updateAccessTime,
  updateBookmark,
} from "$lib/stores/bookmarkStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { getFilename } from "$lib/utils/fileValidation";
import { createListNavigation } from "$lib/utils/listNavigation.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  position?: "center" | "top";
}

let { isOpen = $bindable(false), onClose, onOpenFile, position = "top" }: Props = $props();

type SortOption = "date-added" | "alphabetical" | "last-accessed";
type SortDirection = "asc" | "desc";

let searchQuery = $state("");
let editingId = $state<string | null>(null);
let editTitle = $state("");
let editTags = $state("");
let showAddForm = $state(false);
let addPath = $state("");
let addTitle = $state("");
let addTags = $state("");
let browseError = $state("");
let sortBy = $state<SortOption>("date-added");
let sortDirection = $state<SortDirection>("desc");

function sortByField<T>(items: T[], getField: (item: T) => string, direction: SortDirection): void {
  items.sort((a, b) => {
    const aVal = getField(a);
    const bVal = getField(b);
    return direction === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
  });
}

$effect(() => {
  if (isOpen && !appContext.bookmarks.isLoaded) {
    loadBookmarks();
  }
  if (!isOpen) {
    searchQuery = "";
    editingId = null;
    showAddForm = false;
    browseError = "";
  }
});

const nav = createListNavigation(
  () => sortedBookmarks.length,
  (index) => {
    const bookmark = sortedBookmarks[index];
    if (bookmark && editingId !== bookmark.id) {
      handleOpenBookmark(bookmark);
    }
  },
);

// Reset selection when search query or sort changes
$effect(() => {
  void searchQuery;
  void sortBy;
  void sortDirection;
  nav.reset();
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
    const sorted = [...filteredBookmarks].filter((b) => !deletingIds.has(b.id));
    switch (sortBy) {
      case "date-added":
        sortByField(sorted, (b) => b.created || "", sortDirection);
        break;
      case "alphabetical":
        sortByField(sorted, (b) => b.title.toLowerCase(), sortDirection);
        break;
      case "last-accessed":
        sortByField(sorted, (b) => b.last_accessed || b.created || "", sortDirection);
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
  await updateBookmark(id, editTitle, tags);
  editingId = null;
  editTitle = "";
  editTags = "";
}

let deletingIds = $state(new Set<string>());

async function handleDelete(id: string, e: MouseEvent) {
  e.stopPropagation();
  deletingIds = new Set([...deletingIds, id]);
  setTimeout(() => deleteBookmark(id), 210);
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
      filters: [{ name: translate("bookmarks.markdownFilter"), extensions: ["md", "markdown", "txt"] }],
    });
    if (selected && typeof selected === "string") {
      addPath = selected;
      browseError = "";
      const filename = getFilename(selected);
      const titleWithoutExt = filename.replace(/\.[^/.]+$/, "");
      if (!addTitle) addTitle = titleWithoutExt;
    }
  } catch (_error) {
    browseError = translate("bookmarks.browseError");
  }
}

async function handleAddBookmark() {
  if (!addPath || !addTitle) return;
  try {
    await callBackend("get_file_metadata", { path: addPath }, "File:Metadata");
  } catch (_error) {
    browseError = translate("bookmarks.missingFile");
    return;
  }
  if (isBookmarked(addPath)) {
    browseError = translate("bookmarks.alreadyBookmarked");
    return;
  }
  const tags = addTags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  await addBookmark(addPath, addTitle, tags);
  showAddForm = false;
  addPath = "";
  addTitle = "";
  addTags = "";
  browseError = "";
}

function formatDate(timestamp: string | null): string {
  if (!timestamp) return translate("bookmarks.never");
  const [date] = timestamp.split(" / ");
  return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
}

function toggleSortDirection() {
  sortDirection = sortDirection === "asc" ? "desc" : "asc";
}

function handleKeydown(e: KeyboardEvent) {
  nav.handleKeydown(e);
}
</script>

<Modal bind:isOpen {onClose} {position}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_("bookmarks.title")}
      icon={Bookmark}
      bind:searchValue={searchQuery}
      focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
      searchPlaceholder={$_("bookmarks.placeholder")}
      {onClose}
      onKeydown={handleKeydown}
    >
      {#snippet extraActions()}
        <div class="flex shrink-0 items-center gap-1">
          <select bind:value={sortBy} class="w-auto">
            <option value="date-added">{$_("bookmarks.sortDateAdded")}</option>
            <option value="alphabetical">{$_("bookmarks.sortAlphabetical")}</option>
            <option value="last-accessed">{$_("bookmarks.sortLastAccessed")}</option>
          </select>
          <button
            type="button"
            onclick={toggleSortDirection}
            class="btn-icon"
            title={sortDirection === "asc" ? $_("common.sortAscending") : $_("common.sortDescending")}
          >
            {#if sortDirection === "asc"}
              <ArrowUp size={16} />
            {:else}
              <ArrowDown size={16} />
            {/if}
          </button>
        </div>

        <button
          type="button"
          class="btn-icon btn-icon--accent ml-2 shrink-0"
          onclick={startAdd}
          title={$_("bookmarks.addBookmark")}
        >
          <Plus size={16} />
        </button>
      {/snippet}
    </ModalSearchHeader>
  {/snippet}

  {#if showAddForm}
    <div class="bg-bg-input bg-border-primary border-b px-4 py-3">
      <div class="space-y-2">
        <div class="flex gap-2">
          <Input
            bind:value={addPath}
            type="text"
            placeholder={$_("bookmarks.filePathPlaceholder")}
            class="bg-bg-panel flex-1"
          />
          <button type="button" onclick={handleBrowse} class="btn-base btn-sm">
            {$_("common.browse")}
          </button>
        </div>
        <Input
          bind:value={addTitle}
          type="text"
          placeholder={$_("bookmarks.bookmarkTitlePlaceholder")}
          class="bg-bg-panel"
        />
        <Input bind:value={addTags} type="text" placeholder={$_("bookmarks.tagsPlaceholder")} class="bg-bg-panel" />
        {#if browseError}
          <div class="text-ui-sm text-danger">{browseError}</div>
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (showAddForm = false)} class="btn-base btn-sm btn-secondary">
            {$_("common.cancel")}
          </button>
          <button
            type="button"
            onclick={handleAddBookmark}
            disabled={!addPath || !addTitle}
            class="btn-base btn-sm btn-primary"
          >
            {$_("common.add")}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="text-ui">
    {#if sortedBookmarks.length > 0}
      <div class="divide-border-primary divide-y">
        {#each sortedBookmarks as bookmark, index (bookmark.id)}
          {@const isSelected = index === nav.selectedIndex}
          <div
            out:slide={{ duration: 200 }}
            class="list-row px-4 py-2.5 transition-colors overflow-hidden"
            class:bg-row-even={index % 2 === 1 && !isSelected}
            data-selected={isSelected}
            use:scrollIntoView={isSelected}
          >
            {#if editingId === bookmark.id}
              <div class="space-y-2">
                <Input bind:value={editTitle} type="text" />
                <Input bind:value={editTags} type="text" placeholder={$_("bookmarks.tagsPlaceholder")} />
                <div class="flex justify-end gap-2">
                  <button type="button" onclick={cancelEdit} class="btn-base btn-sm btn-secondary">
                    {$_("common.cancel")}
                  </button>
                  <button type="button" onclick={() => saveEdit(bookmark.id)} class="btn-base btn-sm btn-primary">
                    {$_("common.save")}
                  </button>
                </div>
              </div>
            {:else}
              <div
                role="button"
                tabindex="0"
                class="flex cursor-pointer items-start gap-3"
                onclick={() => handleOpenBookmark(bookmark)}
                onkeydown={(e) => {
                  if (e.key === "Enter") handleOpenBookmark(bookmark);
                }}
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">
                    {bookmark.title}
                  </div>
                  <div class="row-meta text-ui-sm truncate">
                    {bookmark.path}
                  </div>
                  {#if bookmark.tags.length > 0}
                    <div class="mt-1 flex flex-wrap items-center gap-1">
                      <span class="row-icon">
                        <Tag size={12} class="opacity-50" />
                      </span>
                      {#each bookmark.tags as tag (tag)}
                        <span class="row-tag text-ui-sm rounded px-1.5 py-0.5">
                          {tag}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  <div class="row-meta text-ui-sm mt-1">
                    {$_("bookmarks.added")} {formatDate(bookmark.created)}
                    {#if bookmark.last_accessed}
                      • {$_("bookmarks.accessed")} {formatDate(bookmark.last_accessed)}
                    {/if}
                  </div>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      startEdit(bookmark);
                    }}
                    class="btn-icon p-1.5"
                  >
                    <Pen size={14} />
                  </button>
                  <button
                    type="button"
                    onclick={(e) => handleDelete(bookmark.id, e)}
                    class="btn-icon btn-icon--danger p-1.5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else if searchQuery.length >= 2}
      <div class="text-fg-muted px-4 py-8 text-center">{$_("bookmarks.noMatch")}</div>
    {:else if appContext.bookmarks.bookmarks.length === 0}
      <div class="text-fg-muted px-4 py-8 text-center">
        <Bookmark size={48} class="mx-auto mb-2 opacity-30" />
        <div class="mb-1">{$_("bookmarks.none")}</div>
        <div class="text-ui-sm opacity-70">
          {$_("bookmarks.helper")}
        </div>
      </div>
    {/if}
  </div>
</Modal>
