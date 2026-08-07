<script lang="ts">
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDown, ArrowUp, Bookmark, Pen, Plus, Tag, Trash2 } from 'lucide-svelte';
import { slide } from 'svelte/transition';
import { _ } from 'svelte-i18n';
import Input from '$lib/components/ui/Input.svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { MODAL_CONSTRAINTS } from '$lib/config/modalSizes';
import { translate } from '$lib/i18n';
import {
  addBookmark,
  deleteBookmark,
  isBookmarked,
  loadBookmarks,
  updateAccessTime,
  updateBookmark,
} from '$lib/stores/bookmarkStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { getFilename } from '$lib/utils/fileValidation';
import { createListNavigation } from '$lib/utils/listNavigation.svelte';
import { scrollIntoView } from '$lib/utils/modalUtils';

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

function sortByField<T>(items: T[], getField: (item: T) => string, direction: SortDirection): void {
  items.sort((a, b) => {
    const aVal = getField(a);
    const bVal = getField(b);
    return direction === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
  });
}

$effect(() => {
  if (isOpen && !appContext.bookmarks.isLoaded) {
    loadBookmarks();
  }
  if (!isOpen) {
    searchQuery = '';
    editingId = null;
    showAddForm = false;
    browseError = '';
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
      case 'most-recent':
        sortByField(sorted, (b) => b.created || '', sortDirection);
        break;
      case 'alphabetical':
        sortByField(sorted, (b) => b.title.toLowerCase(), sortDirection);
        break;
      case 'last-updated':
        sortByField(sorted, (b) => b.last_accessed || b.created || '', sortDirection);
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

let deletingIds = $state(new Set<string>());

async function handleDelete(id: string, e: MouseEvent) {
  e.stopPropagation();
  deletingIds = new Set([...deletingIds, id]);
  setTimeout(() => deleteBookmark(id), 210);
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
      filters: [{ name: translate('bookmarks.markdownFilter'), extensions: ['md', 'markdown', 'txt'] }],
    });
    if (selected && typeof selected === 'string') {
      addPath = selected;
      browseError = '';
      const filename = getFilename(selected);
      const titleWithoutExt = filename.replace(/\.[^/.]+$/, '');
      if (!addTitle) addTitle = titleWithoutExt;
    }
  } catch (_error) {
    browseError = translate('bookmarks.browseError');
  }
}

async function handleAddBookmark() {
  if (!addPath || !addTitle) return;
  try {
    await callBackend('get_file_metadata', { path: addPath }, 'File:Metadata');
  } catch (_error) {
    browseError = translate('bookmarks.missingFile');
    return;
  }
  if (isBookmarked(addPath)) {
    browseError = translate('bookmarks.alreadyBookmarked');
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
  if (!timestamp) return translate('bookmarks.never');
  const [date] = timestamp.split(' / ');
  return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
}

function toggleSortDirection() {
  sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
}

function handleKeydown(e: KeyboardEvent) {
  nav.handleKeydown(e);
}
</script>

<Modal bind:isOpen {onClose} {position} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_('bookmarks.title')}
      icon={Bookmark}
      bind:searchValue={searchQuery}
      focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
      searchPlaceholder={$_('bookmarks.placeholder')}
      {onClose}
      onKeydown={handleKeydown}
    >
      {#snippet extraActions()}
        <div class="flex shrink-0 items-center gap-1">
          <select
            bind:value={sortBy}
            class="text-ui bg-bg-input text-fg-default bg-border-main cursor-pointer rounded border pl-1 pr-5 py-1 outline-none w-auto"
          >
            <option value="most-recent">{$_('bookmarks.sortMostRecent')}</option>
            <option value="alphabetical">{$_('bookmarks.sortAlphabetical')}</option>
            <option value="last-updated">{$_('bookmarks.sortLastUpdated')}</option>
          </select>
          <button
            type="button"
            onclick={toggleSortDirection}
            class="text-fg-muted hover-surface rounded p-1 transition-colors"
            title={sortDirection === 'asc' ? $_('common.sortAscending') : $_('common.sortDescending')}
          >
            {#if sortDirection === 'asc'}
              <ArrowUp size={16} />
            {:else}
              <ArrowDown size={16} />
            {/if}
          </button>
        </div>

        <button
          type="button"
          class="text-accent-primary hover-surface ml-2 shrink-0 rounded p-1 transition-colors"
          onclick={startAdd}
          title={$_('bookmarks.addBookmark')}
        >
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
            placeholder={$_('bookmarks.filePathPlaceholder')}
            class="bg-bg-panel flex-1"
          />
          <button
            type="button"
            onclick={handleBrowse}
            class="btn-base btn-sm bg-bg-panel text-fg-default border-border-main font-medium transition-colors"
          >
            {$_('common.browse')}
          </button>
        </div>
        <Input
          bind:value={addTitle}
          type="text"
          placeholder={$_('bookmarks.bookmarkTitlePlaceholder')}
          class="bg-bg-panel"
        />
        <Input bind:value={addTags} type="text" placeholder={$_('bookmarks.tagsPlaceholder')} class="bg-bg-panel" />
        {#if browseError}
          <div class="text-ui-sm text-danger-text">{browseError}</div>
        {/if}
        <div class="flex justify-end gap-2">
          <button type="button" onclick={() => (showAddForm = false)} class="btn-base btn-sm btn-secondary">
            {$_('common.cancel')}
          </button>
          <button
            type="button"
            onclick={handleAddBookmark}
            disabled={!addPath || !addTitle}
            class="btn-base btn-sm bg-accent-primary text-fg-inverse border-transparent font-medium disabled:opacity-50"
          >
            {$_('common.add')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="text-ui">
    {#if sortedBookmarks.length > 0}
      <div class="divide-border-main divide-y">
        {#each sortedBookmarks as bookmark, index (bookmark.id)}
          {@const isSelected = index === nav.selectedIndex}
          <div
            out:slide={{ duration: 200 }}
            class="bookmark-row px-4 py-2.5 transition-colors overflow-hidden"
            class:bg-row-even={index % 2 === 1 && !isSelected}
            data-selected={isSelected}
            use:scrollIntoView={isSelected}
          >
            {#if editingId === bookmark.id}
              <div class="space-y-2">
                <Input bind:value={editTitle} type="text" />
                <Input bind:value={editTags} type="text" placeholder={$_('bookmarks.tagsPlaceholder')} />
                <div class="flex justify-end gap-2">
                  <button type="button" onclick={cancelEdit} class="btn-base btn-sm btn-secondary">
                    {$_('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onclick={() => saveEdit(bookmark.id)}
                    class="btn-base btn-sm bg-accent-primary text-fg-inverse border-transparent"
                  >
                    {$_('common.save')}
                  </button>
                </div>
              </div>
            {:else}
              <div
                role="button"
                tabindex="0"
                class="flex cursor-pointer items-start gap-3"
                onclick={() => handleOpenBookmark(bookmark)}
                onkeydown={(e) => { if (e.key === 'Enter') handleOpenBookmark(bookmark); }}
                onmouseenter={() => nav.select(index)}
              >
                <div class="min-w-0 flex-1">
                  <div class="title truncate font-medium">
                    {bookmark.title}
                  </div>
                  <div class="path text-ui-sm truncate">
                    {bookmark.path}
                  </div>
                  {#if bookmark.tags.length > 0}
                    <div class="mt-1 flex flex-wrap items-center gap-1">
                      <span class="tag-icon">
                        <Tag size={12} class="opacity-50" />
                      </span>
                      {#each bookmark.tags as tag (tag)}
                        <span class="tag text-ui-sm rounded px-1.5 py-0.5">
                          {tag}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  <div class="date text-ui-sm mt-1">
                    {$_('bookmarks.added')} {formatDate(bookmark.created)}
                    {#if bookmark.last_accessed}
                      • {$_('bookmarks.accessed')} {formatDate(bookmark.last_accessed)}
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
                    class="icon-btn rounded p-1.5 transition-colors"
                  >
                    <Pen size={14} />
                  </button>
                  <button
                    type="button"
                    onclick={(e) => handleDelete(bookmark.id, e)}
                    class="icon-btn icon-btn--danger rounded p-1.5 transition-colors"
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
      <div class="text-fg-muted px-4 py-8 text-center">{$_('bookmarks.noMatch')}</div>
    {:else if appContext.bookmarks.bookmarks.length === 0}
      <div class="text-fg-muted px-4 py-8 text-center">
        <Bookmark size={48} class="mx-auto mb-2 opacity-30" />
        <div class="mb-1">{$_('bookmarks.none')}</div>
        <div class="text-ui-sm opacity-70">
          {$_('bookmarks.helper')}
        </div>
      </div>
    {/if}
  </div>
</Modal>

<style>
.bookmark-row[data-selected="true"] {
  background-color: var(--accent-primary);
}

.bookmark-row[data-selected="true"] .title,
.bookmark-row[data-selected="true"] .path,
.bookmark-row[data-selected="true"] .date,
.bookmark-row[data-selected="true"] .tag-icon {
  color: var(--text-inverse);
}

.bookmark-row[data-selected="true"] .path,
.bookmark-row[data-selected="true"] .date {
  opacity: 0.8;
}

.bookmark-row[data-selected="false"] .path {
  color: var(--text-secondary);
  opacity: 0.6;
}

.bookmark-row[data-selected="false"] .date {
  color: var(--text-secondary);
  opacity: 0.5;
}

.bookmark-row .tag {
  background-color: var(--surface-input);
  color: var(--text-secondary);
}

.bookmark-row[data-selected="true"] .tag {
  background-color: rgba(255, 255, 255, 0.2);
  color: var(--text-inverse);
}

.bookmark-row[data-selected="true"] .tag-icon {
  opacity: 0.7;
}

.icon-btn {
  color: var(--text-secondary);
  background-color: transparent;
}

.icon-btn:hover {
  background-color: var(--surface-hover);
}

.icon-btn--danger {
  color: var(--danger-text);
}

.bookmark-row[data-selected="true"] .icon-btn {
  color: var(--text-inverse);
  background-color: rgba(255, 255, 255, 0.15);
}

.bookmark-row[data-selected="true"] .icon-btn:hover {
  background-color: rgba(255, 255, 255, 0.25);
}
</style>
