<script lang="ts">
    import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
    import {
        clearRecentFiles,
        loadRecentFiles,
        recentFilesStore,
        removeFromRecentFiles,
    } from '$lib/stores/recentFilesStore.svelte';
    import { CONFIG } from '$lib/utils/config';
    import { openFileByPath } from '$lib/utils/fileSystem';
    import { scrollIntoView } from '$lib/utils/modalUtils';
    import { Clock, History, Trash2, X } from 'lucide-svelte';
    import Modal from './Modal.svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
    }

    let { isOpen = $bindable(false), onClose }: Props = $props();

    let searchQuery = $state('');
    let searchInputEl = $state<HTMLInputElement>();
    let selectedIndex = $state(0);

    $effect(() => {
        if (isOpen) {
            loadRecentFiles();
            searchQuery = '';
            selectedIndex = 0;
            setTimeout(() => searchInputEl?.focus(), CONFIG.UI_TIMING.FOCUS_IMMEDIATE_MS);
        }
    });

    $effect(() => {
        void searchQuery;
        selectedIndex = 0;
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
            bind:inputRef={searchInputEl}
            searchPlaceholder="Search history..."
            {onClose}
            onKeydown={handleKeydown}>
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
                {#each filteredFiles as path, index (path)}
                    {@const isSelected = index === selectedIndex}
                    <div
                        class="group px-4 py-2.5 transition-colors"
                        class:bg-row-even={index % 2 === 1 && !isSelected}
                        style:background-color={isSelected
                            ? 'var(--color-accent-primary)'
                            : index % 2 === 1
                              ? 'var(--surface-row)'
                              : 'transparent'}
                        use:scrollIntoView={isSelected}>
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="flex cursor-pointer items-center justify-between gap-3"
                            onclick={() => handleOpenFile(path)}
                            onmouseenter={() => (selectedIndex = index)}>
                            <div class="min-w-0 flex-1">
                                <div
                                    class="truncate font-medium"
                                    style:color={isSelected
                                        ? 'var(--color-fg-inverse)'
                                        : 'var(--color-fg-default)'}>
                                    {path.split(/[\\/]/).pop()}
                                </div>
                                <div
                                    class="text-ui-sm truncate"
                                    style:color={isSelected
                                        ? 'var(--color-fg-inverse)'
                                        : 'var(--color-fg-muted)'}
                                    style:opacity={isSelected ? 0.8 : 0.6}>
                                    {path}
                                </div>
                            </div>
                            <button
                                onclick={(e) => handleRemove(path, e)}
                                class="rounded p-1.5 opacity-0 transition-all group-hover:opacity-100"
                                style:color={isSelected
                                    ? 'var(--color-fg-inverse)'
                                    : 'var(--color-fg-muted)'}
                                style:background-color={isSelected
                                    ? 'rgba(255,255,255,0.15)'
                                    : 'transparent'}
                                onmouseenter={(e) =>
                                    (e.currentTarget.style.backgroundColor = isSelected
                                        ? 'rgba(255,255,255,0.25)'
                                        : 'var(--surface-hover)')}
                                onmouseleave={(e) =>
                                    (e.currentTarget.style.backgroundColor = isSelected
                                        ? 'rgba(255,255,255,0.15)'
                                        : 'transparent')}
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
