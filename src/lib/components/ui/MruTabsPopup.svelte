<script lang="ts">
import { CircleAlert, FileText, PencilLine, SquarePen } from "lucide-svelte";
import { tick } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Modal from "$lib/components/ui/Modal.svelte";
import { MODAL_CONSTRAINTS } from "$lib/config/modalSizes";
import { appContext } from "$lib/stores/state.svelte";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tabId: string) => void;
  selectedId: string | null;
}

let { isOpen, onClose, onSelect, selectedId }: Props = $props();

// Modal blurs the previously focused element on close; restore it so the
// editor keeps keyboard focus after the popup is dismissed.
let previouslyFocused: HTMLElement | null = null;

$effect(() => {
  if (isOpen) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return;
  }
  const el = previouslyFocused;
  previouslyFocused = null;
  if (el) {
    tick().then(() => {
      if (el.isConnected) el.focus();
    });
  }
});

let mruTabs = $derived(
  appContext.editor.mruStack
    .map((id) => appContext.editor.tabs.find((t) => t.id === id))
    .filter((t) => t !== undefined),
);

function scrollIntoView(node: HTMLElement, isSelected: boolean) {
  if (isSelected) {
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  return {
    update(newIsSelected: boolean) {
      if (newIsSelected) {
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
  };
}
</script>

<Modal {isOpen} {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <div>
      <h3 class="text-fg-default text-lg font-semibold">{$_("mruTabs.title")}</h3>
      <p class="text-ui-sm text-fg-muted mt-1">{$_("mruTabs.hint")}</p>
    </div>
  {/snippet}

  <div class="py-1">
    {#each mruTabs as tab, index (tab.id)}
      {@const isSelected = tab.id === selectedId}
      <button
        type="button"
        class="list-row mru-item outline-none"
        class:bg-row-even={index % 2 === 1 && !isSelected}
        data-selected={isSelected}
        use:scrollIntoView={isSelected}
        onclick={() => {
          onSelect(tab.id);
          onClose();
        }}
      >
        <div class="mru-badge">
          {index + 1}
        </div>

        {#if tab.fileCheckFailed}
          <div class="mru-icon">
            <CircleAlert size={14} class="shrink-0" />
          </div>
        {:else if tab.path && tab.isDirty}
          <div class="mru-icon mru-icon--dirty">
            <SquarePen size={14} class="shrink-0" />
          </div>
        {:else if !tab.path}
          <div class="mru-icon">
            <PencilLine size={14} class="shrink-0" />
          </div>
        {:else}
          <div class="mru-icon">
            <FileText size={14} class="shrink-0" />
          </div>
        {/if}

        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">{tab.title}</div>
          {#if tab.path}
            <div class="mru-path">{tab.path}</div>
          {/if}
        </div>

        {#if tab.isDirty}
          <div class="mru-dot" use:tooltip={$_("mruTabs.modified")}></div>
        {/if}
      </button>
    {/each}
  </div>
</Modal>

<style>
.mru-icon--dirty {
  --icon-color: var(--dirty-indicator);
}
</style>
