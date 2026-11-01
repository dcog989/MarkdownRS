<script lang="ts">
import History from "lucide-svelte/icons/history";
import { tick } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Modal from "$lib/components/ui/Modal.svelte";
import TabIcon from "$lib/components/ui/TabIcon.svelte";
import { MODAL_CONSTRAINTS } from "$lib/config/modalSizes";
import { appContext } from "$lib/stores/state.svelte";
import { scrollIntoView } from "$lib/utils/modalUtils";

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
</script>

<Modal {isOpen} {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <div class="flex items-center gap-2">
      <History size={16} class="text-accent-secondary" />
      <div class="flex items-baseline gap-2">
        <h3 class="text-fg-default text-lg font-semibold">{$_("mruTabs.title")}</h3>
        <p class="text-ui-sm text-fg-muted">- {$_("mruTabs.hint")}</p>
      </div>
    </div>
  {/snippet}

  <div class="flex flex-col gap-2 p-4">
    {#each mruTabs as tab, index (tab.id)}
      {@const isSelected = tab.id === selectedId}
      <button
        type="button"
        class="list-row mru-item rounded border outline-none"
        class:border-transparent={isSelected}
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

        <TabIcon {tab} variant="row" />

        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="min-w-0 truncate font-medium">{tab.title}</span>
          {#if tab.path}
            <span class="mru-path row-meta min-w-0 flex-1 truncate" use:tooltip={tab.path}>{tab.path}</span>
          {/if}
        </div>

        {#if tab.isDirty}
          <div class="mru-dot" use:tooltip={$_("mruTabs.modified")}></div>
        {/if}
      </button>
    {/each}
  </div>
</Modal>
