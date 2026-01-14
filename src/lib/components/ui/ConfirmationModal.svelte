<script lang="ts">
    import { resolveDialog } from '$lib/stores/dialogStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import Modal from './Modal.svelte';
</script>

<Modal isOpen={appContext.ui.dialog.isOpen} onClose={() => resolveDialog('cancel')} zIndex={100}>
    {#snippet header()}
        <span class="text-sm font-semibold text-fg-default">{appContext.ui.dialog.options.title}</span>
    {/snippet}

    <div class="p-4 text-sm leading-relaxed text-fg-default">
        {appContext.ui.dialog.options.message}
    </div>

    {#snippet footer()}
        {#if appContext.ui.dialog.options.cancelLabel}
            <button class="btn-secondary" onclick={() => resolveDialog('cancel')}>
                {appContext.ui.dialog.options.cancelLabel}
            </button>
        {/if}
        {#if appContext.ui.dialog.options.discardLabel}
            <button class="btn-danger-outline" onclick={() => resolveDialog('discard')}>
                {appContext.ui.dialog.options.discardLabel}
            </button>
        {/if}
        {#if appContext.ui.dialog.options.saveLabel}
            <button class="btn-success" onclick={() => resolveDialog('save')}>
                {appContext.ui.dialog.options.saveLabel}
            </button>
        {/if}
    {/snippet}
</Modal>
