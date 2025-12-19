<script lang="ts">
    import { dialogStore } from "$lib/stores/dialogStore.svelte.ts";
    import Modal from "./Modal.svelte";
</script>

<Modal isOpen={dialogStore.isOpen} onClose={() => dialogStore.resolve("cancel")} title={dialogStore.options.title} width="448px" zIndex={100} showCloseButton={false}>
    <div class="p-4 text-sm leading-relaxed" style="color: var(--color-fg-default)">
        {dialogStore.options.message}
    </div>

    {#snippet footer()}
        <button class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer" style="background-color: transparent; border-color: var(--color-border-light); color: var(--color-fg-default);" onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")} onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "transparent")} onclick={() => dialogStore.resolve("cancel")}>
            {dialogStore.options.cancelLabel}
        </button>
        <button
            class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer"
            style="background-color: transparent; border-color: var(--color-danger); color: var(--color-danger-text);"
            onmouseenter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--color-danger)";
                e.currentTarget.style.color = "var(--color-fg-inverse)";
            }}
            onmouseleave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--color-danger-text)";
            }}
            onclick={() => dialogStore.resolve("discard")}
        >
            {dialogStore.options.discardLabel}
        </button>
        <button class="px-3 py-1.5 rounded text-xs transition-colors cursor-pointer border border-transparent" style="background-color: var(--color-success); color: var(--color-fg-inverse);" onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-success-hover)")} onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-success)")} onclick={() => dialogStore.resolve("save")}>
            {dialogStore.options.saveLabel}
        </button>
    {/snippet}
</Modal>
