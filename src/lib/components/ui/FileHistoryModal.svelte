<script lang="ts">
import { ArrowDown, ArrowUp, Clock, History, Trash2, X } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import Modal from '$lib/components/ui/Modal.svelte';
import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
import { translate } from '$lib/i18n';
import {
    clearFileHistory,
    fileHistoryStore,
    loadFileHistory,
    removeFromFileHistory,
} from '$lib/stores/fileHistoryStore.svelte';
import { CONFIG } from '$lib/utils/config';
import { openFileByPath } from '$lib/utils/fileSystem';
import { getFilename } from '$lib/utils/fileValidation';
import { createListNavigation } from '$lib/utils/listNavigation.svelte';
import { scrollIntoView } from '$lib/utils/modalUtils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

let { isOpen = $bindable(false), onClose }: Props = $props();

type SortDirection = 'asc' | 'desc';

let searchQuery = $state('');
let sortDirection = $state<SortDirection>('desc');
let filteredFiles = $derived(
    fileHistoryStore.files.filter((path) => path.toLowerCase().includes(searchQuery.toLowerCase())),
);

let sortedFiles = $derived(
    sortDirection === 'asc' ? [...filteredFiles].reverse() : filteredFiles,
);

const nav = createListNavigation(
    () => sortedFiles.length,
    (index) => {
        const path = sortedFiles[index];
        if (path) handleOpenFile(path);
    },
);

$effect(() => {
    if (isOpen) {
        loadFileHistory();
        searchQuery = '';
        nav.reset();
    }
});

$effect(() => {
    void searchQuery;
    void sortDirection;
    nav.reset();
});

function handleOpenFile(path: string) {
    openFileByPath(path);
    onClose();
}

async function handleRemove(path: string, e: MouseEvent) {
    e.stopPropagation();
    await removeFromFileHistory(path);
}

async function handleClearAll() {
    if (confirm(translate('fileHistory.confirmClear'))) {
        await clearFileHistory();
    }
}

function toggleSortDirection() {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
}
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title={$_('fileHistory.title')}
            icon={History}
            bind:searchValue={searchQuery}
            focusDelay={CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS}
            searchPlaceholder={$_('fileHistory.placeholder')}
            {onClose}
            onKeydown={nav.handleKeydown}>
            {#snippet extraActions()}
                <div class="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onclick={toggleSortDirection}
                        class="text-fg-muted hover-surface rounded p-1 transition-colors"
                        title={sortDirection === 'asc' ? $_('common.sortAscending') : $_('common.sortDescending')}>
                        {#if sortDirection === 'asc'}
                            <ArrowUp size={16} />
                        {:else}
                            <ArrowDown size={16} />
                        {/if}
                    </button>
                    {#if fileHistoryStore.files.length > 0}
                        <button
                            type="button"
                            class="text-fg-muted hover:text-danger-text hover-surface rounded p-1 transition-colors"
                            onclick={handleClearAll}
                            use:tooltip={$_('fileHistory.clearHistory')}>
                            <Trash2 size={16} />
                        </button>
                    {/if}
                </div>
            {/snippet}
        </ModalSearchHeader>
    {/snippet}

    <div class="text-ui">
        {#if sortedFiles.length > 0}
            <div class="divide-border-main divide-y">
                {#each sortedFiles as path, index (path)}
                    {@const isSelected = index === nav.selectedIndex}
                    <div
                        class="file-history-row group px-4 py-2.5 transition-colors"
                        class:bg-row-even={index % 2 === 1 && !isSelected}
                        data-selected={isSelected}
                        use:scrollIntoView={isSelected}>
                        <div
                            role="button"
                            tabindex="0"
                            class="flex cursor-pointer items-center justify-between gap-3"
                            onclick={() => handleOpenFile(path)}
                            onkeydown={(e) => { if (e.key === 'Enter') handleOpenFile(path); }}
                            onmouseenter={() => nav.select(index)}>
                            <div class="min-w-0 flex-1">
                                <div class="file-history-title truncate font-medium">
                                    {getFilename(path)}
                                </div>
                                <div class="file-history-path text-ui-sm truncate">
                                    {path}
                                </div>
                            </div>
                            <button
                                type="button"
                                onclick={(e) => handleRemove(path, e)}
                                class="file-history-remove rounded p-1.5 opacity-0 transition-all group-hover:opacity-100"
                                title={$_('fileHistory.removeFromHistory')}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {:else if searchQuery.length > 0}
            <div class="text-fg-muted px-4 py-8 text-center">{$_('fileHistory.noMatch')}</div>
        {:else}
            <div class="text-fg-muted px-4 py-8 text-center">
                <Clock size={48} class="mx-auto mb-2 opacity-30" />
                <div class="mb-1">{$_('fileHistory.none')}</div>
                <div class="text-ui-sm opacity-70">{$_('fileHistory.helper')}</div>
            </div>
        {/if}
    </div>
</Modal>

<style>
    .file-history-row[data-selected="true"] {
        background-color: var(--accent-primary);
    }

    .file-history-row[data-selected="true"] .file-history-title {
        color: var(--text-inverse);
    }

    .file-history-row[data-selected="true"] .file-history-path {
        color: var(--text-inverse);
        opacity: 0.8;
    }

    .file-history-row[data-selected="false"] .file-history-title {
        color: var(--text-primary);
    }

    .file-history-row[data-selected="false"] .file-history-path {
        color: var(--text-secondary);
        opacity: 0.6;
    }

    .file-history-remove {
        color: var(--text-secondary);
        background-color: transparent;
    }

    .file-history-remove:hover {
        background-color: var(--surface-hover);
    }

    .file-history-row[data-selected="true"] .file-history-remove {
        color: var(--text-inverse);
        background-color: rgba(255, 255, 255, 0.15);
    }

    .file-history-row[data-selected="true"] .file-history-remove:hover {
        background-color: rgba(255, 255, 255, 0.25);
    }
</style>
