<script lang="ts">
import ListTree from "lucide-svelte/icons/list-tree";
import { tick } from "svelte";
import { _ } from "svelte-i18n";
import Modal from "$lib/components/ui/Modal.svelte";
import ModalSearchHeader from "$lib/components/ui/ModalSearchHeader.svelte";
import { MODAL_CONSTRAINTS } from "$lib/config/modalSizes";
import { CONFIG } from "$lib/utils/config";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { fuzzyMatches } from "$lib/utils/fuzzyMatch";
import { createListNavigation } from "$lib/utils/listNavigation.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";
import { collectOutlineHeadings, jumpToHeading, type OutlineHeading } from "$lib/utils/outline";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

let query = $state("");
let headings = $state<OutlineHeading[]>([]);

let filtered = $derived(headings.filter((heading) => fuzzyMatches(query, heading.text)));

const nav = createListNavigation(
  () => filtered.length,
  (index) => select(filtered[index]),
);

$effect(() => {
  if (!isOpen) return;
  query = "";
  const view = getActiveEditorView();
  headings = view ? collectOutlineHeadings(view.state) : [];
});

$effect(() => {
  void query;
  nav.reset();
});

function select(heading: OutlineHeading | undefined) {
  const view = getActiveEditorView();
  if (!heading || !view) return;
  onClose();
  // Jump after the modal's focus restore so the editor keeps keyboard focus.
  void tick().then(() => jumpToHeading(view, heading.from));
}
</script>

<Modal bind:isOpen {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_("outline.title")}
      icon={ListTree}
      bind:searchValue={query}
      focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
      searchPlaceholder={$_("outline.filterPlaceholder")}
      {onClose}
      onKeydown={nav.handleKeydown}
    />
  {/snippet}

  <div class="text-ui flex flex-col gap-1 p-4">
    {#if filtered.length === 0}
      <div class="text-fg-muted px-2 py-8 text-center">
        {headings.length === 0 ? $_("outline.empty") : $_("outline.noMatch")}
      </div>
    {:else}
      {#each filtered as heading, index (heading.from)}
        {@const isSelected = index === Math.min(nav.selectedIndex, filtered.length - 1)}
        <button
          type="button"
          class="list-row flex w-full items-center rounded border py-2 pr-3 text-left transition-colors"
          class:border-transparent={isSelected}
          data-selected={isSelected}
          style:padding-left={`${1 + (heading.level - 1) * 0.75}rem`}
          use:scrollIntoView={isSelected}
          onclick={() => select(heading)}
        >
          <span class="min-w-0 truncate">{heading.text || $_("outline.untitled")}</span>
        </button>
      {/each}
    {/if}
  </div>
</Modal>
