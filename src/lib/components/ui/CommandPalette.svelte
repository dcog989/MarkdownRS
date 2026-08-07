<script lang="ts">
import { ArrowUpDown, Zap } from 'lucide-svelte';
import { tick } from 'svelte';
import { _ } from 'svelte-i18n';
import type { Command } from '$lib/commands/commands';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { MODAL_CONSTRAINTS } from '$lib/config/modalSizes';
import { translate } from '$lib/i18n';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { cycleSortMode, SORT_LABELS, sortCommands } from '$lib/utils/commandPaletteSort';
import { createListNavigation } from '$lib/utils/listNavigation.svelte';
import { scrollIntoView } from '$lib/utils/modalUtils';
import { shortcutManager } from '$lib/utils/shortcuts';

let {
  isOpen = $bindable(false),
  commands = [],
  onClose,
} = $props<{
  isOpen: boolean;
  commands: Command[];
  onClose?: () => void;
}>();

let query = $state('');
let inputRef: HTMLInputElement | undefined = $state();

let filteredCommands = $derived(
  commands.filter((c: Command) => translate(c.label).toLowerCase().includes(query.toLowerCase())),
);

let flatOps = $derived(
  sortCommands(
    filteredCommands,
    settingsState.commandPaletteSort,
    settingsState.commandUsage,
    settingsState.commandUsageCounts,
  ),
);

let flatOpsIndex = $derived(new Map(flatOps.map((c: Command, i: number) => [c, i])));

let groupedCommands = $derived(
  (() => {
    const byCategory = new Map<string, Command[]>();
    for (const c of flatOps) {
      let list = byCategory.get(c.category);
      if (!list) {
        list = [];
        byCategory.set(c.category, list);
      }
      list.push(c);
    }
    return [...byCategory.entries()].map(([category, commands]) => ({ category, commands }));
  })(),
);

const nav = createListNavigation(
  () => flatOps.length,
  (index) => execute(flatOps[index]),
  2,
);

$effect(() => {
  if (isOpen) {
    query = '';
    nav.reset();
    tick().then(() => inputRef?.focus());
  }
});

$effect(() => {
  const el = inputRef;
  if (!el) return;
  const handler = (e: KeyboardEvent) => nav.handleKeydown(e);
  el.addEventListener('keydown', handler);
  return () => el.removeEventListener('keydown', handler);
});

function execute(command: Command) {
  if (!command) return;
  command.handler?.();
  settingsState.commandUsage[command.id] = Date.now();
  settingsState.commandUsageCounts[command.id] = (settingsState.commandUsageCounts[command.id] ?? 0) + 1;
  close();
}

function close() {
  isOpen = false;
  if (onClose) onClose();
}
</script>

<Modal bind:isOpen {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <ModalSearchHeader
      title={$_('commandPalette.title')}
      icon={Zap}
      bind:searchValue={query}
      bind:inputRef
      searchPlaceholder={$_('commandPalette.placeholder')}
      onClose={close}
    >
      {#snippet extraActions()}
        <button
          type="button"
          class="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-fg-muted transition-colors outline-none hover-surface"
          title={settingsState.commandPaletteSort}
          onclick={cycleSortMode}
        >
          <ArrowUpDown size={14} />
          {translate(SORT_LABELS[settingsState.commandPaletteSort])}
        </button>
      {/snippet}
    </ModalSearchHeader>
  {/snippet}

  <div class="space-y-6 p-4">
    {#if groupedCommands.length > 0}
      {#each groupedCommands as group (group.category)}
        <div>
          <div class="mb-3 flex items-center gap-2">
            <Zap size={16} class="text-accent-primary" />
            <h3 class="text-fg-default text-sm font-semibold tracking-wide uppercase">
              {translate(group.category)}
            </h3>
          </div>
          <div class="grid grid-cols-2 gap-2">
            {#each group.commands as command (command.id)}
              {@const globalIndex = flatOpsIndex.get(command)}
              {@const isSelected = globalIndex === nav.selectedIndex}
              {@const shortcut = shortcutManager.getShortcutDisplay(command.id)}
              <button
                type="button"
                class="bg-border-main hover-surface flex items-start gap-3 rounded border p-3 text-left transition-colors outline-none"
                style="background-color: {isSelected
                                  ? 'var(--accent-primary)'
                                  : 'var(--surface-2)'};
                                  color: {isSelected
                                  ? 'var(--text-inverse)'
                                  : 'var(--text-primary)'};"
                use:scrollIntoView={isSelected}
                onmouseenter={() => globalIndex !== undefined && nav.select(globalIndex)}
                onclick={() => execute(command)}
              >
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium whitespace-nowrap">{translate(command.label)}</div>
                  {#if shortcut}
                    <div
                      class="mt-0.5 truncate text-xs"
                      style:color={isSelected ? 'var(--text-inverse)' : 'var(--text-secondary)'}
                    >
                      <span class="opacity-60">{shortcut}</span>
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    {:else}
      <div class="text-fg-muted px-4 py-8 text-center">
        <Zap size={48} class="mx-auto mb-2 opacity-30" />
        <div>{$_('commandPalette.noMatch')}</div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <p class="text-fg-muted mr-auto text-xs"></p>
    <button
      type="button"
      class="btn-base bg-accent-primary text-fg-inverse border-transparent font-medium hover:opacity-80"
      onclick={close}
    >
      {$_('commandPalette.close')}
    </button>
  {/snippet}
</Modal>
