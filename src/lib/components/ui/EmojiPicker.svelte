<script lang="ts">
import { SmilePlus } from 'lucide-svelte';
import { tick } from 'svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { pickerEmojis } from '$lib/config/emojiData';
import { MODAL_CONSTRAINTS } from '$lib/config/modalSizes';
import { translate } from '$lib/i18n';
import { getActiveEditorView } from '$lib/utils/editorCommands';

let { isOpen = $bindable(false), onClose = () => {} } = $props<{
  isOpen: boolean;
  onClose: () => void;
}>();

let query = $state('');
let inputRef: HTMLInputElement | undefined = $state();

let results = $derived(pickerEmojis(query));

$effect(() => {
  if (isOpen) {
    query = '';
    tick().then(() => {
      inputRef?.focus();
    });
  }
});

function insertEmoji(char: string) {
  const view = getActiveEditorView();
  if (view) {
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: char },
      selection: { anchor: from + char.length },
      scrollIntoView: true,
    });
  }
  isOpen = false;
  if (view) {
    // Modal.svelte blurs the previously focused element when it closes;
    // re-focus the editor once its cleanup has run.
    tick().then(() => view.focus());
  }
}
</script>

<Modal bind:isOpen {onClose} width={MODAL_CONSTRAINTS.SEARCH_WIDTH}>
  {#snippet header()}
    <ModalSearchHeader
      title={translate('emojiPicker.title')}
      icon={SmilePlus}
      bind:searchValue={query}
      bind:inputRef
      searchPlaceholder={translate('emojiPicker.placeholder')}
      onClose={() => (isOpen = false)}
    />
  {/snippet}

  {#if results.length > 0}
    <div class="emoji-grid p-4">
      {#each results as entry (entry.char)}
        <button
          type="button"
          class="hover:bg-bg-hover flex h-9 w-9 items-center justify-center rounded-md text-2xl transition-colors"
          use:tooltip={`:${entry.shortcode}:`}
          onclick={() => insertEmoji(entry.char)}
        >
          {entry.char}
        </button>
      {/each}
    </div>
  {:else}
    <div class="text-fg-muted px-4 py-8 text-center">
      <SmilePlus size={48} class="mx-auto mb-2 opacity-30" />
      <div>{$_('emojiPicker.noMatch')}</div>
    </div>
  {/if}
</Modal>
