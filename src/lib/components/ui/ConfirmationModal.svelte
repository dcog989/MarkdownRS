<script lang="ts">
    import { dialogStore } from "$lib/stores/dialogStore.svelte.ts";
</script>

{#if dialogStore.isOpen}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4" style="background-color: var(--bg-backdrop);" onclick={() => dialogStore.resolve("cancel")}>
        <!-- Modal Content -->
        <div class="shadow-2xl rounded-lg w-full max-w-md overflow-hidden border" style="background-color: var(--bg-panel); border-color: var(--border-light);" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            <div class="px-4 py-3 border-b flex justify-between items-center" style="background-color: var(--bg-header); border-color: var(--border-main);">
                <span class="text-sm font-semibold" style="color: var(--fg-default)">{dialogStore.options.title}</span>
            </div>

            <!-- Body -->
            <div class="p-4 text-sm leading-relaxed" style="color: var(--fg-default)">
                {dialogStore.options.message}
            </div>

            <!-- Footer -->
            <div class="px-4 py-3 flex justify-end gap-2" style="background-color: var(--bg-panel)">
                <button
                    class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer"
                    style="
                        background-color: transparent;
                        border-color: var(--border-light);
                        color: var(--fg-default);
                    "
                    onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                    onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    onclick={() => dialogStore.resolve("cancel")}
                >
                    {dialogStore.options.cancelLabel}
                </button>
                <button
                    class="px-3 py-1.5 rounded text-xs border transition-colors cursor-pointer"
                    style="
                        background-color: transparent;
                        border-color: var(--danger);
                        color: var(--danger-text);
                    "
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
                <button
                    class="px-3 py-1.5 rounded text-xs transition-colors cursor-pointer border border-transparent"
                    style="
                        background-color: var(--success);
                        color: var(--fg-inverse);
                    "
                    onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--success-hover)")}
                    onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "var(--success)")}
                    onclick={() => dialogStore.resolve("save")}
                >
                    {dialogStore.options.saveLabel}
                </button>
            </div>
        </div>
    </div>
{/if}
