<script lang="ts">
    import {
        OPERATION_CATEGORIES,
        getOperationsByCategory,
        type OperationId,
    } from '$lib/config/textOperationsRegistry';
    import { performTextTransform } from '$lib/stores/editorStore.svelte';
    import { Type, X } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    let { isOpen = false, onClose } = $props<{ isOpen: boolean; onClose: () => void }>();

    function handleOperation(operationId: OperationId) {
        performTextTransform(operationId);
        onClose();
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Type size={20} class="text-accent-secondary" />
            <h2 class="text-fg-default text-lg font-semibold">Text Transformations</h2>
        </div>
        <button
            type="button"
            class="rounded p-1 hover:bg-white/10"
            onclick={onClose}
            aria-label="Close"
        >
            <X size={18} class="text-fg-muted" />
        </button>
    {/snippet}

    <div class="space-y-6 p-4">
        {#each OPERATION_CATEGORIES as category (category.id)}
            {@const CategoryIcon = category.icon}
            {@const operations = getOperationsByCategory(category.id)}
            <div>
                <div class="mb-3 flex items-center gap-2">
                    <CategoryIcon size={16} class="text-accent-primary" />
                    <h3 class="text-fg-default text-sm font-semibold tracking-wide uppercase">
                        {category.title}
                    </h3>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each operations as operation (operation.id)}
                        {@const OperationIcon = operation.icon}
                        <button
                            type="button"
                            class="border-border-main flex items-start gap-3 rounded border p-3 text-left transition-colors hover:bg-white/10"
                            onclick={() => handleOperation(operation.id)}
                        >
                            <div class="mt-0.5 shrink-0">
                                <OperationIcon size={16} class="text-accent-secondary" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="text-fg-default text-sm font-medium whitespace-nowrap">
                                    {operation.label}
                                </div>
                                <div class="text-fg-muted mt-0.5 truncate text-xs">
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
        <p class="text-fg-muted mr-auto text-xs">All operations support undo (Ctrl+Z)</p>
        <button
            type="button"
            class="bg-accent-primary text-fg-inverse rounded px-4 py-2 text-sm font-medium hover:opacity-80"
            onclick={onClose}
        >
            Close
        </button>
    {/snippet}
</Modal>
