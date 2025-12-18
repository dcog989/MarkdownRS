<script lang="ts">
    import { dialogStore } from "$lib/stores/dialogStore.svelte.ts";
    import Modal from "./Modal.svelte";
</script>

<Modal isOpen={dialogStore.isOpen} onClose={() => dialogStore.resolve("cancel")} title={dialogStore.options.title} width="448px" zIndex={100} showCloseButton={false}>
    <div class="p-4 text-sm leading-relaxed" style="color: var(--fg-default)">
        {dialogStore.options.message}
    </div>

    {#snippet footer()}
        <button class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer" style="background-color: transparent; border-color: var(--border-light); color: var(--fg-default);" onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")} onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "transparent")} onclick={() => dialogStore.resolve("cancel")}>
            {dialogStore.options.cancelLabel}
        </button>
        <button
            class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer"
            style="background-color: transparent; border-color: var(--danger); color: var(--danger-text);"
            onmouseenter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--danger)";
                e.currentTarget.style.color = "var(--fg-inverse)";
            }}
            onmouseleave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--danger-text)";
            }}
            onclick={() => dialogStore.resolve("discard")}
        >
            {dialogStore.options.discardLabel}
        </button>
        <button class="px-3 py-1.5 rounded text-xs transition-colors cursor-pointer border border-transparent" style="background-color: var(--success); color: var(--fg-inverse);" onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--success-hover)")} onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "var(--success)")} onclick={() => dialogStore.resolve("save")}>
            {dialogStore.options.saveLabel}
        </button>
    {/snippet}
</Modal>
