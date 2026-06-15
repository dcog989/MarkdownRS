<script lang="ts">
import { Type } from 'lucide-svelte';
import { tick } from 'svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import type { OperationId } from '$lib/config/textOperationsRegistry';
import { getOperationsByCategory, OPERATION_CATEGORIES } from '$lib/config/textOperationsRegistry';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { createListNavigation } from '$lib/utils/listNavigation.svelte';
import { scrollIntoView } from '$lib/utils/modalUtils';
import { shortcutManager } from '$lib/utils/shortcuts';

let { isOpen = false, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

let searchQuery = $state('');
let inputRef: HTMLInputElement | undefined = $state();

let undoShortcut = $derived(shortcutManager.getShortcutDisplay('edit.undo'));

function getOpShortcut(opId: string): string {
  return shortcutManager.getShortcutDisplay(`textop.${opId}`);
}

let filteredCategories = $derived(
  OPERATION_CATEGORIES.map((category) => ({
    ...category,
    operations: getOperationsByCategory(category.id).filter(
      (op) =>
        !searchQuery ||
        op.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.description.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  })).filter((c) => c.operations.length > 0),
);

let flatOps = $derived(filteredCategories.flatMap((c) => c.operations));

const nav = createListNavigation(
  () => flatOps.length,
  (index) => {
    const op = flatOps[index];
    if (op) handleOperation(op.id);
  },
);

$effect(() => {
  if (isOpen) {
    searchQuery = '';
    nav.reset();
    tick().then(() => inputRef?.focus());
  }
});

function handleOperation(operationId: OperationId) {
  performTextTransform(operationId);
  close();
}

function close() {
  if (onClose) onClose();
}
</script>

<Modal bind:isOpen onClose={close}>
  {#snippet header()}
    <ModalSearchHeader
      title="Text Transformations"
      icon={Type}
      bind:searchValue={searchQuery}
      bind:inputRef
      searchPlaceholder="Search transformations..."
      {onClose}
      onKeydown={nav.handleKeydown} />
  {/snippet}

  <div class="space-y-6 p-4">
    {#if filteredCategories.length > 0}
      {#each filteredCategories as category (category.id)}
        {@const CategoryIcon = category.icon}
        <div>
          <div class="mb-3 flex items-center gap-2">
            <CategoryIcon size={16} class="text-accent-primary" />
            <h3
              class="text-fg-default text-sm font-semibold tracking-wide uppercase">
              {category.title}
            </h3>
          </div>
          <div class="grid grid-cols-2 gap-2">
            {#each category.operations as operation (operation.id)}
              {@const globalIndex = flatOps.indexOf(operation)}
              {@const isSelected = globalIndex === nav.selectedIndex}
              {@const shortcut = getOpShortcut(operation.id)}
              {@const OperationIcon = operation.icon}
              <button
                type="button"
                class="bg-border-main hover-surface flex items-start gap-3 rounded border p-3 text-left transition-colors outline-none"
                style="background-color: {isSelected
                  ? 'var(--color-accent-primary)'
                  : 'var(--color-bg-panel)'};
                  color: {isSelected
                  ? 'var(--color-fg-inverse)'
                  : 'var(--color-fg-default)'};"
                use:scrollIntoView={isSelected}
                onmouseenter={() => nav.select(globalIndex)}
                onclick={() => handleOperation(operation.id)}>
                <div class="mt-0.5 shrink-0" class:opacity-80={isSelected}>
                  <OperationIcon size={16} class="text-accent-secondary" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium whitespace-nowrap">{operation.label}</div>
                  <div class="mt-0.5 truncate text-xs" style:color={isSelected ? 'var(--color-fg-inverse)' : 'var(--color-fg-muted)'}>
                    {#if shortcut}
                      <span class="opacity-60">{shortcut}</span>
                      <span class="mx-1 opacity-30">·</span>
                    {/if}
                    {operation.description}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {:else}
      <div class="text-fg-muted px-4 py-8 text-center">
        <Type size={48} class="mx-auto mb-2 opacity-30" />
        <div>No transformations match your search</div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <p class="text-fg-muted mr-auto text-xs">All operations support undo ({undoShortcut})</p>
    <button
      type="button"
      class="btn-base bg-accent-primary text-fg-inverse border-transparent font-medium hover:opacity-80"
      onclick={close}>
      Close
    </button>
  {/snippet}
</Modal>
