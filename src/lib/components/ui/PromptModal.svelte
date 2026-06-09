<script lang="ts">
import { tick } from 'svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import { dialogStore, resolvePrompt } from '$lib/stores/dialogStore.svelte.ts';

let inputEl: HTMLInputElement | undefined = $state();
let inputValue = $state('');

$effect(() => {
  if (dialogStore.promptIsOpen) {
    inputValue = dialogStore.promptOptions.value || '';
    tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }
});

function handleConfirm() {
  resolvePrompt(inputValue);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleConfirm();
  }
}
</script>

<Modal
  isOpen={dialogStore.promptIsOpen}
  onClose={() => resolvePrompt(null)}
  zIndex={100}
  position="center">
  {#snippet header()}
    <span class="text-fg-default text-sm font-semibold"
      >{dialogStore.promptOptions.title}</span
    >
  {/snippet}

  <div class="flex flex-col gap-3 px-4 py-4">
    {#if dialogStore.promptOptions.message}
      <label for="prompt-input" class="text-fg-default text-sm leading-relaxed"
        >{dialogStore.promptOptions.message}</label
      >
    {/if}
    <input
      bind:this={inputEl}
      id="prompt-input"
      type="text"
      bind:value={inputValue}
      onkeydown={handleKeydown}
      class="border-border-input bg-bg-card text-fg-default focus:ring-accent rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
    />
  </div>

  {#snippet footer()}
    <button
      type="button"
      class="btn-base btn-sm btn-secondary"
      onclick={() => resolvePrompt(null)}>
      Cancel
    </button>
    <button type="button" class="btn-base btn-sm btn-success" onclick={handleConfirm}>
      OK
    </button>
  {/snippet}
</Modal>
