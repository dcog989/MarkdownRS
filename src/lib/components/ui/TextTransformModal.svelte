<script lang="ts">
    import { TEXT_OPERATIONS } from "$lib/config/textOperations";
    import { editorStore, type OperationTypeString } from "$lib/stores/editorStore.svelte.ts";
    import { Type, X } from "lucide-svelte";

    let { isOpen = false, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

    function handleOperation(operationId: OperationTypeString) {
        editorStore.performTextTransform(operationId);
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isOpen && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--color-bg-backdrop);" onclick={onClose}>
        <div class="w-fit min-w-[600px] max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);" onclick={(e) => e.stopPropagation()}>
            <!-- Header -->
            <div class="flex items-center justify-between p-4 border-b shrink-0" style="border-color: var(--color-border-light);">
                <div class="flex items-center gap-2">
                    <Type size={20} style="color: var(--color-accent-secondary);" />
                    <h2 class="text-lg font-semibold" style="color: var(--color-fg-default);">Text Transformations</h2>
                </div>
                <button type="button" class="p-1 rounded hover:bg-white/10" onclick={onClose} aria-label="Close">
                    <X size={18} style="color: var(--color-fg-muted);" />
                </button>
            </div>

            <!-- Content -->
            <div class="overflow-y-auto p-4 space-y-6 flex-1 custom-scrollbar">
                {#each TEXT_OPERATIONS as category}
                    {@const CategoryIcon = category.icon}
                    <div>
                        <div class="flex items-center gap-2 mb-3">
                            <CategoryIcon size={16} style="color: var(--color-accent-primary);" />
                            <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--color-fg-default);">
                                {category.title}
                            </h3>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            {#each category.operations as operation}
                                {@const OperationIcon = operation.icon}
                                <button type="button" class="flex items-start gap-3 p-3 rounded text-left hover:bg-white/10 transition-colors" style="border: 1px solid var(--color-border-main);" onclick={() => handleOperation(operation.id)}>
                                    <div class="flex-shrink-0 mt-0.5">
                                        {#if OperationIcon}
                                            <OperationIcon size={16} style="color: var(--color-accent-secondary);" />
                                        {:else}
                                            <div class="w-4"></div>
                                        {/if}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-medium whitespace-nowrap" style="color: var(--color-fg-default);">
                                            {operation.label}
                                        </div>
                                        {#if operation.description}
                                            <div class="text-xs mt-0.5 truncate" style="color: var(--color-fg-muted);">
                                                {operation.description}
                                            </div>
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Footer -->
            <div class="p-4 border-t flex justify-between items-center shrink-0" style="border-color: var(--color-border-light); background-color: var(--color-bg-main);">
                <p class="text-xs" style="color: var(--color-fg-muted);">All operations support undo (Ctrl+Z)</p>
                <button type="button" class="px-4 py-2 rounded text-sm font-medium hover:opacity-80" style="background-color: var(--color-accent-primary); color: var(--color-fg-inverse);" onclick={onClose}> Close </button>
            </div>
        </div>
    </div>
{/if}
