<script lang="ts">
    import { OPERATION_CATEGORIES, getOperationsByCategory, type OperationId } from "$lib/config/textOperationsRegistry";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { Type, X } from "lucide-svelte";
    import Modal from "./Modal.svelte";

    let { isOpen = false, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

    function handleOperation(operationId: OperationId) {
        appContext.editor.performTextTransform(operationId);
        onClose();
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Type size={20} class="text-accent-secondary" />
            <h2 class="text-lg font-semibold text-fg-default">Text Transformations</h2>
        </div>
        <button type="button" class="p-1 rounded hover:bg-white/10" onclick={onClose} aria-label="Close">
            <X size={18} class="text-fg-muted" />
        </button>
    {/snippet}

    <div class="p-4 space-y-6">
        {#each OPERATION_CATEGORIES as category}
            {@const CategoryIcon = category.icon}
            {@const operations = getOperationsByCategory(category.id)}
            <div>
                <div class="flex items-center gap-2 mb-3">
                    <CategoryIcon size={16} class="text-accent-primary" />
                    <h3 class="text-sm font-semibold uppercase tracking-wide text-fg-default">
                        {category.title}
                    </h3>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each operations as operation}
                        {@const OperationIcon = operation.icon}
                        <button type="button" class="flex items-start gap-3 p-3 rounded text-left hover:bg-white/10 transition-colors border border-border-main" onclick={() => handleOperation(operation.id)}>
                            <div class="flex-shrink-0 mt-0.5">
                                <OperationIcon size={16} class="text-accent-secondary" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium whitespace-nowrap text-fg-default">
                                    {operation.label}
                                </div>
                                <div class="text-xs mt-0.5 truncate text-fg-muted">
                                    {operation.description}
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        {/each}
    </div>

    {#snippet footer()}
        <p class="text-xs mr-auto text-fg-muted">All operations support undo (Ctrl+Z)</p>
        <button type="button" class="px-4 py-2 rounded text-sm font-medium hover:opacity-80 bg-accent-primary text-fg-inverse" onclick={onClose}> Close </button>
    {/snippet}
</Modal>
