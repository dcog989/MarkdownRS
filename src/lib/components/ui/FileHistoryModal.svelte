<script lang="ts">
import { ArrowDown, ArrowUp, Clock, History, X } from "lucide-svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Modal from "$lib/components/ui/Modal.svelte";
import ModalSearchHeader from "$lib/components/ui/ModalSearchHeader.svelte";
import { fileHistoryStore, loadFileHistory, removeFromFileHistory } from "$lib/stores/fileHistoryStore.svelte";
import { CONFIG } from "$lib/utils/config";
import { openFileByPath } from "$lib/utils/fileSystem";
import { getFilename } from "$lib/utils/fileValidation";
import { createListNavigation } from "$lib/utils/listNavigation.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

type SortOption = "recent" | "alphabetical";
type SortDirection = "asc" | "desc";

let searchQuery = $state("");
let sortBy = $state<SortOption>("recent");
// Direction is per sort option: alphabetical reads ascending (A-Z), recent reads
// descending (newest first).
let sortDirections = $state<Record<SortOption, SortDirection>>({ recent: "desc", alphabetical: "asc" });
let sortDirection = $derived(sortDirections[sortBy]);
let filteredFiles = $derived(
  fileHistoryStore.files.filter((path) => path.toLowerCase().includes(searchQuery.toLowerCase())),
);

let sortedFiles = $derived.by(() => {
  const files = [...filteredFiles];
  if (sortBy === "alphabetical") {
    files.sort((a, b) => {
      const byName = getFilename(a).localeCompare(getFilename(b));
      return byName !== 0 ? byName : a.localeCompare(b);
    });
    return sortDirection === "desc" ? files.reverse() : files;
  }
  // Store order is most-recently-opened first.
  return sortDirection === "asc" ? files.reverse() : files;
});

const nav = createListNavigation(
  () => sortedFiles.length,
  (index) => {
    const path = sortedFiles[index];
    if (path) handleOpenFile(path);
  },
);

$effect(() => {
  if (isOpen) {
    loadFileHistory();
    searchQuery = "";
    nav.reset();
  }
});

$effect(() => {
  void searchQuery;
  void sortBy;
  void sortDirection;
  nav.reset();
});

function handleOpenFile(path: string) {
  openFileByPath(path);
  onClose();
}

async function handleRemove(path: string, e: MouseEvent) {
  e.stopPropagation();
  await removeFromFileHistory(path);
}

function toggleSortDirection() {
  sortDirections[sortBy] = sortDirection === "asc" ? "desc" : "asc";
}
</script>

<Modal bind:isOpen {onClose}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_("fileHistory.title")}
      icon={History}
      bind:searchValue={searchQuery}
      focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
      searchPlaceholder={$_("fileHistory.placeholder")}
      {onClose}
      onKeydown={nav.handleKeydown}
    >
      {#snippet extraActions()}
        <div class="flex shrink-0 items-center gap-1">
          <select bind:value={sortBy} class="w-auto" title={$_("fileHistory.sortBy")}>
            <option value="recent">{$_("fileHistory.sortRecent")}</option>
            <option value="alphabetical">{$_("fileHistory.sortAlphabetical")}</option>
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
      {/snippet}
    </ModalSearchHeader>
  {/snippet}

  <div class="text-ui flex flex-col gap-2 p-4">
    {#if sortedFiles.length > 0}
      {#each sortedFiles as path, index (path)}
        {@const isSelected = index === nav.selectedIndex}
        {@const name = getFilename(path)}
        {@const dir = path.slice(0, path.length - name.length)}
        <div
          class="list-row group flex items-center gap-3 rounded border p-3 transition-colors"
          class:border-transparent={isSelected}
          data-selected={isSelected}
          use:scrollIntoView={isSelected}
        >
          <div
            role="button"
            tabindex="0"
            class="flex min-w-0 flex-1 cursor-pointer items-center"
            use:tooltip={path}
            onclick={() => handleOpenFile(path)}
            onkeydown={(e) => {
              if (e.key === "Enter") handleOpenFile(path);
            }}
          >
            <span class="min-w-0 truncate opacity-60">{dir}</span>
            <span class="max-w-full truncate font-medium">{name}</span>
          </div>
          <button
            type="button"
            onclick={(e) => handleRemove(path, e)}
            class="btn-icon btn-icon--danger p-1.5 opacity-0 group-hover:opacity-100"
            title={$_("fileHistory.removeFromHistory")}
          >
            <X size={16} />
          </button>
        </div>
      {/each}
    {:else if searchQuery.length > 0}
      <div class="text-fg-muted px-4 py-8 text-center">{$_("fileHistory.noMatch")}</div>
    {:else}
      <div class="text-fg-muted px-4 py-8 text-center">
        <Clock size={48} class="mx-auto mb-2 opacity-30" />
        <div class="mb-1">{$_("fileHistory.none")}</div>
        <div class="text-ui-sm opacity-70">{$_("fileHistory.helper")}</div>
      </div>
    {/if}
  </div>
</Modal>
