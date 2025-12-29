<script lang="ts">
    import { appContext } from "$lib/stores/state.svelte.ts";
    import Modal from "./Modal.svelte";
</script>

<Modal isOpen={appContext.ui.dialog.isOpen} onClose={() => appContext.ui.dialog.resolve("cancel")} title={appContext.ui.dialog.options.title} zIndex={100} showCloseButton={false}>
    <div class="p-4 text-sm leading-relaxed text-fg-default">
        {appContext.ui.dialog.options.message}
    </div>

    {#snippet footer()}
        <button class="btn-secondary" onclick={() => appContext.ui.dialog.resolve("cancel")}>
            {appContext.ui.dialog.options.cancelLabel}
        </button>
        <button class="btn-danger-outline" onclick={() => appContext.ui.dialog.resolve("discard")}>
            {appContext.ui.dialog.options.discardLabel}
        </button>
        <button class="btn-success" onclick={() => appContext.ui.dialog.resolve("save")}>
            {appContext.ui.dialog.options.saveLabel}
        </button>
    {/snippet}
</Modal>
