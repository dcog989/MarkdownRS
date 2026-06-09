<script lang="ts">
import Modal from '$lib/components/ui/Modal.svelte';
import { resolveDialog } from '$lib/stores/dialogStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';

const buttons = $derived.by(() => {
  const opts = appContext.ui.dialog.options;
  const result: { action: 'save' | 'discard' | 'cancel'; label: string }[] = [];
  if (opts.saveLabel) result.push({ action: 'save', label: opts.saveLabel });
  if (opts.discardLabel) result.push({ action: 'discard', label: opts.discardLabel });
  if (opts.cancelLabel) result.push({ action: 'cancel', label: opts.cancelLabel });
  return result;
});
</script>

<Modal isOpen={appContext.ui.dialog.isOpen} onClose={() => resolveDialog('cancel')} zIndex={100}>
    {#snippet header()}
        <span class="text-fg-default text-sm font-semibold"
            >{appContext.ui.dialog.options.title}</span
        >
    {/snippet}

    <div class="text-fg-default p-4 text-sm leading-relaxed" style="white-space: pre-line">
        {appContext.ui.dialog.options.message}
    </div>

    {#snippet footer()}
        {#each buttons as { action, label }, i (action)}
            <button
                type="button"
                class="btn-base btn-sm"
                class:btn-secondary={i > 0}
                onclick={() => resolveDialog(action)}>
                {label}
            </button>
        {/each}
    {/snippet}
</Modal>
