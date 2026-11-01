<script lang="ts">
import Pin from "lucide-svelte/icons/pin";
import X from "lucide-svelte/icons/x";
import { untrack } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
import TabIcon from "$lib/components/ui/TabIcon.svelte";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import { focusOnMount } from "$lib/utils/dom";
import { requestCloseTab } from "$lib/utils/fileSystem";
import { createListNavigation } from "$lib/utils/listNavigation.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";
import { tabTooltip } from "$lib/utils/tabDisplay";

let {
  isOpen = false,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
} = $props();

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
  // The list can shrink after the index was set (a filter is typed, tabs are
  // closed), so fall back to the last row instead of reading an undefined entry.
  (index) => {
    const tab = filteredTabs[index] ?? filteredTabs[filteredTabs.length - 1];
    if (tab) onSelect(tab.id);
  },
);

function getDropdownTitle(tab: EditorTab): string {
  return tab.customTitle || tab.title;
}

function getTooltipContent(tab: EditorTab): string {
  return tabTooltip(tab, { missing: $_("tabButton.missingFile"), unsaved: $_("tabButton.unsaved") });
}

$effect(() => {
  if (isOpen) {
    searchQuery = "";
    const activeIndex = untrack(() => appContext.editor.tabs.findIndex((tab) => tab.id === appContext.app.activeTabId));
    nav.select(Math.max(activeIndex, 0));
  }
});

// Enter resolves an index against the filtered list, so a typed query must move
// the selection back to the top match instead of leaving it on an old position.
$effect(() => {
  if (searchQuery.trim() === "") return;
  nav.select(0);
});

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
            class="list-row group flex w-full items-center gap-3 rounded border transition-colors"
            data-selected={isSelected}
            class:border-transparent={isSelected}
            use:scrollIntoView={isSelected}
          >
            <button
              type="button"
              class="text-ui flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left outline-none"
              onclick={() => onSelect(tab.id)}
              role="menuitem"
              use:tooltip={getTooltipContent(tab)}
            >
              <TabIcon {tab} variant="row" />

              <span class="flex-1 truncate">{getDropdownTitle(tab)}</span>
            </button>

            {#if tab.isPinned}
              <span class="flex shrink-0 items-center px-1">
                <Pin size={16} class="row-icon" style="--icon-color: var(--accent-secondary);" />
              </span>
            {:else}
              <button
                type="button"
                class="btn-icon btn-icon--danger shrink-0 p-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
