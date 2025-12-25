<script lang="ts">
    import { dialogStore } from "$lib/stores/dialogStore.svelte.ts";
    import Modal from "./Modal.svelte";
</script>

<Modal isOpen={dialogStore.isOpen} onClose={() => dialogStore.resolve("cancel")} title={dialogStore.options.title} width="448px" zIndex={100} showCloseButton={false}>
    <div class="p-4 text-sm leading-relaxed text-[var(--color-fg-default)]">
        {dialogStore.options.message}
    </div>

    {#snippet footer()}
        <button class="btn-secondary" onclick={() => dialogStore.resolve("cancel")}>
            {dialogStore.options.cancelLabel}
        </button>
        <button class="btn-danger-outline" onclick={() => dialogStore.resolve("discard")}>
            {dialogStore.options.discardLabel}
        </button>
        <button class="btn-success" onclick={() => dialogStore.resolve("save")}>
            {dialogStore.options.saveLabel}
        </button>
    {/snippet}
</Modal>
