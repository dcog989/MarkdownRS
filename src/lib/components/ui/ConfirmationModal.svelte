<script lang="ts">
import Modal from '$lib/components/ui/Modal.svelte';
import { resolveDialog } from '$lib/stores/dialogStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';

function autofocus(node: HTMLButtonElement) {
  node.focus();
}
</script>

<Modal isOpen={appContext.ui.dialog.isOpen} onClose={() => resolveDialog('cancel')} zIndex={100}>
    {#snippet header()}
        <span class="text-fg-default text-sm font-semibold"
            >{appContext.ui.dialog.options.title}</span
        >
    {/snippet}

    <div class="text-fg-default p-4 text-sm leading-relaxed">
        {appContext.ui.dialog.options.message}
    </div>

    {#snippet footer()}
        {#if appContext.ui.dialog.options.saveLabel}
            <button type="button" class="btn-base btn-sm btn-secondary" onclick={() => resolveDialog('save')}>
                {appContext.ui.dialog.options.saveLabel}
            </button>
        {/if}
        {#if appContext.ui.dialog.options.discardLabel}
            <button type="button" class="btn-base btn-sm btn-secondary" onclick={() => resolveDialog('discard')}>
                {appContext.ui.dialog.options.discardLabel}
            </button>
        {/if}
        {#if appContext.ui.dialog.options.cancelLabel}
            <button type="button" class="btn-base btn-sm" use:autofocus onclick={() => resolveDialog('cancel')}>
                {appContext.ui.dialog.options.cancelLabel}
            </button>
        {/if}
    {/snippet}
</Modal>
