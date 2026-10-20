<script lang="ts">
import { CircleAlert, FileText, Pencil, PencilLine, Pin, SquarePen, X } from "lucide-svelte";
import { untrack } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import { focusOnMount } from "$lib/utils/dom";
import { requestCloseTab } from "$lib/utils/fileSystem";
import { formatFileSize } from "$lib/utils/fileValidation";
import { createListNavigation } from "$lib/utils/listNavigation.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";

let {
  isOpen = false,
  onSelect,
  onClose,
} = $props<{
  isOpen: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}>();

let searchQuery = $state("");
// @ts-expect-error: used by bind:this in template
let searchInputRef = $state<HTMLInputElement | null>();
let dropdownListRef = $state<HTMLDivElement>();

let filteredTabs = $derived.by(() => {
  const tabs = appContext.editor.tabs;
  if (searchQuery.trim() === "") {
    return tabs;
  }
  const query = searchQuery.toLowerCase();
  return tabs.filter((tab) => {
    return (
      (tab.customTitle || tab.title).toLowerCase().includes(query) || (tab.path || "").toLowerCase().includes(query)
    );
  });
});

const nav = createListNavigation(
  () => filteredTabs.length,
  (index) => handleSelect(filteredTabs[index].id),
);

function getDropdownTitle(tab: EditorTab): string {
  return tab.customTitle || tab.title;
}

function getTooltipContent(tab: EditorTab): string {
  const parts: string[] = [];
  const sizeStr = formatFileSize(tab.sizeBytes || 0);
  const formattedTime = tab.formattedTimestamp || "";
  const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

  if (tab.fileCheckFailed) {
    parts.push($_("tabButton.missingFile"));
    if (tab.path) parts.push(tab.path);
  } else {
    parts.push(tab.path || $_("tabButton.unsaved"));
  }
  parts.push(bottomLine);
  return parts.join("\n");
}

$effect(() => {
  if (isOpen) {
    searchQuery = "";
    const activeIndex = untrack(() => appContext.editor.tabs.findIndex((tab) => tab.id === appContext.app.activeTabId));
    nav.select(activeIndex >= 0 ? activeIndex : 0);
  }
});

function handleSelect(id: string) {
  onSelect(id);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    onClose();
    return;
  }
  nav.handleKeydown(e);
}
</script>

{#if isOpen}
  <div
    role="button"
    tabindex="0"
    aria-label={$_("tabDropdown.close")}
    class="fixed inset-0 z-40"
    onclick={onClose}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") onClose();
    }}
  ></div>
  <div
    class="border-border-secondary absolute top-full left-0 z-50 mt-1 flex max-h-[calc(100vh-120px)] w-80 flex-col rounded-lg border shadow-2xl"
    style:background-color="var(--surface-2)"
    role="menu"
  >
    <div class="border-border-secondary shrink-0 border-b p-2">
      <input
        use:focusOnMount={CONFIG.UI_TIMING.FOCUS_DELAY_MS}
        bind:this={searchInputRef}
        bind:value={searchQuery}
        type="text"
        placeholder={$_("tabDropdown.filterPlaceholder")}
        class="text-fg-default w-full bg-transparent px-2 py-1 text-ui outline-none"
        onkeydown={handleKeydown}
      >
    </div>

    <div class="relative min-h-0 flex-1">
      <div bind:this={dropdownListRef} class="dropdown-list flex max-h-60vh flex-col gap-2 overflow-y-auto p-2">
        {#each filteredTabs as tab, index (tab.id)}
          {@const isSelected = index === nav.selectedIndex}
          <div
            role="none"
            class="list-row group flex w-full items-center gap-3 rounded border p-3 transition-colors"
            data-selected={isSelected}
            class:border-transparent={isSelected}
            use:scrollIntoView={isSelected}
          >
            <button
              type="button"
              class="text-ui flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left outline-none"
              onclick={() => handleSelect(tab.id)}
              role="menuitem"
              use:tooltip={getTooltipContent(tab)}
            >
              {#if tab.fileCheckFailed}
                <CircleAlert size={14} class="row-icon shrink-0" style="--icon-color: var(--danger);" />
              {:else if !tab.path}
                {#if tab.content.length > 0}
                  <PencilLine size={14} class="row-icon shrink-0" />
                {:else}
                  <Pencil size={14} class="row-icon shrink-0" />
                {/if}
              {:else if tab.isDirty}
                <SquarePen size={14} class="row-icon shrink-0" style="--icon-color: var(--dirty-indicator);" />
              {:else}
                <FileText size={14} class="row-icon shrink-0" />
              {/if}

              <span class="flex-1 truncate">{getDropdownTitle(tab)}</span>
            </button>

            {#if tab.isPinned}
              <span class="flex shrink-0 items-center px-1">
                <Pin size={16} class="row-icon" style="--icon-color: var(--accent-secondary);" />
              </span>
            {:else}
              <button
                type="button"
                class="btn-icon btn-icon--danger shrink-0 p-1.5 opacity-0 group-hover:opacity-100"
                onclick={(e) => {
                  e.stopPropagation();
                  requestCloseTab(tab.id);
                }}
                aria-label={$_("tabDropdown.closeTab")}
              >
                <X size={16} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
      {#if dropdownListRef}
        <CustomScrollbar viewport={dropdownListRef} />
      {/if}
    </div>
  </div>
{/if}
