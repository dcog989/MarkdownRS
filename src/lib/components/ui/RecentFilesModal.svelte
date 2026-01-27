<script lang="ts">
    import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
    import {
        clearRecentFiles,
        loadRecentFiles,
        recentFilesStore,
        removeFromRecentFiles,
    } from '$lib/stores/recentFilesStore.svelte';
    import { openFileByPath } from '$lib/utils/fileSystem';
    import { Clock, History, Trash2, X } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state('');
    let searchInputEl = $state<HTMLInputElement>();

    $effect(() => {
        if (isOpen) {
            loadRecentFiles();
            searchQuery = '';
            setTimeout(() => searchInputEl?.focus(), 0);
        }
    });

    let filteredFiles = $derived(
        recentFilesStore.files.filter((path) =>
            path.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );

    function handleOpenFile(path: string) {
        openFileByPath(path);
        onClose();
    }

    async function handleRemove(path: string, e: MouseEvent) {
        e.stopPropagation();
        await removeFromRecentFiles(path);
    }

    async function handleClearAll() {
        if (confirm('Clear file history?')) {
            await clearRecentFiles();
        }
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Recent Files"
            icon={History}
            bind:searchValue={searchQuery}
            bind:inputRef={searchInputEl}
            searchPlaceholder="Search history..."
            {onClose}>
            {#snippet extraActions()}
                {#if recentFilesStore.files.length > 0}
                    <button
                        class="text-fg-muted hover:text-danger-text hover-surface rounded p-1 transition-colors"
                        onclick={handleClearAll}
                        title="Clear History">
                        <Trash2 size={16} />
                    </button>
                {/if}
            {/snippet}
        </ModalSearchHeader>
    {/snippet}

    <div class="text-ui">
        {#if filteredFiles.length > 0}
            <div class="divide-border-main divide-y">
                {#each filteredFiles as path (path)}
                    <div class="group hover-surface-light px-4 py-2.5 transition-colors">
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="flex cursor-pointer items-center justify-between gap-3"
                            onclick={() => handleOpenFile(path)}>
                            <div class="min-w-0 flex-1">
                                <div class="text-fg-default truncate font-medium">
                                    {path.split(/[\\/]/).pop()}
                                </div>
                                <div class="text-ui-sm text-fg-muted truncate opacity-60">
                                    {path}
                                </div>
                            </div>
                            <button
                                onclick={(e) => handleRemove(path, e)}
                                class="text-fg-muted hover:text-danger-text hover-surface rounded p-1.5 opacity-0 transition-all group-hover:opacity-100"
                                title="Remove from history">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {:else if searchQuery.length > 0}
            <div class="text-fg-muted px-4 py-8 text-center">No files match your search</div>
        {:else}
            <div class="text-fg-muted px-4 py-8 text-center">
                <Clock size={48} class="mx-auto mb-2 opacity-30" />
                <div class="mb-1">No recent files</div>
                <div class="text-ui-sm opacity-70">Files you open will appear here</div>
            </div>
        {/if}
    </div>
</Modal>
