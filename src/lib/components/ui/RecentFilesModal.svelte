<script lang="ts">
import { Clock, History, Trash2, X } from 'lucide-svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import {
    clearRecentFiles,
    loadRecentFiles,
    recentFilesStore,
    removeFromRecentFiles,
} from '$lib/stores/recentFilesStore.svelte';
import { CONFIG } from '$lib/utils/config';
import { openFileByPath } from '$lib/utils/fileSystem';
import { getFilename } from '$lib/utils/fileValidation';
import { scrollIntoView } from '$lib/utils/modalUtils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

let searchQuery = $state('');
let selectedIndex = $state(0);

$effect(() => {
    if (isOpen) {
        loadRecentFiles();
        searchQuery = '';
        selectedIndex = 0;
    }
});

$effect(() => {
    void searchQuery;
    selectedIndex = 0;
});

let filteredFiles = $derived(
    recentFilesStore.files.filter((path) => path.toLowerCase().includes(searchQuery.toLowerCase())),
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

function handleKeydown(e: KeyboardEvent) {
    if (filteredFiles.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredFiles.length;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredFiles.length) % filteredFiles.length;
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const path = filteredFiles[selectedIndex];
        if (path) {
            handleOpenFile(path);
        }
    }
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Recent Files"
            icon={History}
            bind:searchValue={searchQuery}
            focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
            searchPlaceholder="Search history..."
            {onClose}
            onKeydown={handleKeydown}>
            {#snippet extraActions()}
                {#if recentFilesStore.files.length > 0}
                    <button
                        type="button"
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
                {#each filteredFiles as path, index (path)}
                    {@const isSelected = index === selectedIndex}
                    <div
                        class="recent-row group px-4 py-2.5 transition-colors"
                        class:bg-row-even={index % 2 === 1 && !isSelected}
                        data-selected={isSelected}
                        use:scrollIntoView={isSelected}>
                        <div
                            role="button"
                            tabindex="0"
                            class="flex cursor-pointer items-center justify-between gap-3"
                            onclick={() => handleOpenFile(path)}
                            onkeydown={(e) => { if (e.key === 'Enter') handleOpenFile(path); }}
                            onmouseenter={() => (selectedIndex = index)}>
                            <div class="min-w-0 flex-1">
                                <div class="recent-title truncate font-medium">
                                    {getFilename(path)}
                                </div>
                                <div class="recent-path text-ui-sm truncate">
                                    {path}
                                </div>
                            </div>
                            <button
                                type="button"
                                onclick={(e) => handleRemove(path, e)}
                                class="recent-remove rounded p-1.5 opacity-0 transition-all group-hover:opacity-100"
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

<style>
    .recent-row[data-selected="true"] {
        background-color: var(--accent-primary);
    }

    .recent-row[data-selected="true"] .recent-title {
        color: var(--text-inverse);
    }

    .recent-row[data-selected="true"] .recent-path {
        color: var(--text-inverse);
        opacity: 0.8;
    }

    .recent-row[data-selected="false"] .recent-title {
        color: var(--text-primary);
    }

    .recent-row[data-selected="false"] .recent-path {
        color: var(--text-secondary);
        opacity: 0.6;
    }

    .recent-remove {
        color: var(--text-secondary);
        background-color: transparent;
    }

    .recent-remove:hover {
        background-color: var(--surface-hover);
    }

    .recent-row[data-selected="true"] .recent-remove {
        color: var(--text-inverse);
        background-color: rgba(255, 255, 255, 0.15);
    }

    .recent-row[data-selected="true"] .recent-remove:hover {
        background-color: rgba(255, 255, 255, 0.25);
    }
</style>
