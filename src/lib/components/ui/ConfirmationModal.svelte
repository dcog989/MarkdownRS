<script lang="ts">
    import { dialogStore } from "$lib/stores/dialogStore.svelte.ts";
</script>

{#if dialogStore.isOpen}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onclick={() => dialogStore.resolve(false)}>
        <!-- Modal Content -->
        <div class="bg-[#252526] border border-[#454545] shadow-2xl rounded-lg w-full max-w-sm overflow-hidden" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            <div class="px-4 py-3 border-b border-[#333] bg-[#2d2d2d] flex justify-between items-center">
                <span class="text-sm font-semibold text-white">{dialogStore.options.title}</span>
            </div>

            <!-- Body -->
            <div class="p-4 text-[#cccccc] text-sm leading-relaxed">
                {dialogStore.options.message}
            </div>

            <!-- Footer -->
            <div class="px-4 py-3 flex justify-end gap-2 bg-[#252526]">
                <button class="px-4 py-1.5 rounded hover:bg-[#3e3e42] text-white text-xs border border-[#3e3e42] transition-colors" onclick={() => dialogStore.resolve(false)}>
                    {dialogStore.options.cancelLabel}
                </button>
                <button class="px-4 py-1.5 rounded bg-[#0e639c] hover:bg-[#1177bb] text-white text-xs transition-colors" onclick={() => dialogStore.resolve(true)}>
                    {dialogStore.options.okLabel}
                </button>
            </div>
        </div>
    </div>
{/if}
