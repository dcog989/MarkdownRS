<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import type { EditorTab } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { requestCloseTab } from '$lib/utils/fileSystem';
    import { formatFileSize } from '$lib/utils/fileValidation';
    import { CircleAlert, FileText, Pencil, PencilLine, Pin, SquarePen, X } from 'lucide-svelte';
    import CustomScrollbar from './CustomScrollbar.svelte';

    let {
        isOpen = false,
        onSelect,
        onClose,
    } = $props<{
        isOpen: boolean;
        onSelect: (id: string) => void;
        onClose: () => void;
    }>();

    let searchQuery = $state('');
    let selectedIndex = $state(0);
    let searchInputRef = $state<HTMLInputElement>();
    let dropdownListRef = $state<HTMLDivElement>();
    let lastClientX = 0;
    let lastClientY = 0;
    let ignoreMouseMovement = $state(false);
    let mouseMovementTimer: number | null = null;

    let filteredTabs = $derived.by(() => {
        const tabs = appContext.editor.tabs;
        if (searchQuery.trim() === '') {
            return tabs;
        }
        const query = searchQuery.toLowerCase();
        return tabs.filter((tab) => {
            return (
                (tab.customTitle || tab.title).toLowerCase().includes(query) ||
                (tab.path || '').toLowerCase().includes(query)
            );
        });
    });

    function getDropdownTitle(tab: EditorTab): string {
        return tab.customTitle || tab.title;
    }

    function getTooltipContent(tab: EditorTab): string {
        const parts: string[] = [];
        const sizeStr = formatFileSize(tab.sizeBytes || 0);
        const formattedTime = tab.formattedTimestamp || '';
        const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

        if (tab.fileCheckFailed) {
            parts.push('File missing from original location');
            if (tab.path) parts.push(tab.path);
        } else {
            parts.push(tab.path || 'Unsaved content');
        }
        parts.push(bottomLine);
        return parts.join('\n');
    }

    $effect(() => {
        if (isOpen) {
            lastClientX = 0;
            lastClientY = 0;
            searchQuery = '';
            selectedIndex = 0;
            ignoreMouseMovement = true;

            if (mouseMovementTimer !== null) {
                clearTimeout(mouseMovementTimer);
            }

            mouseMovementTimer = window.setTimeout(() => {
                ignoreMouseMovement = false;
                mouseMovementTimer = null;
            }, 100);

            setTimeout(() => searchInputRef?.focus(), 50);
        } else {
            if (mouseMovementTimer !== null) {
                clearTimeout(mouseMovementTimer);
                mouseMovementTimer = null;
            }
        }
    });

    function handleSelect(id: string) {
        onSelect(id);
    }

    function handleHover(index: number, e: MouseEvent) {
        if (ignoreMouseMovement) return;

        if (e.clientX === lastClientX && e.clientY === lastClientY) return;

        lastClientX = e.clientX;
        lastClientY = e.clientY;
        selectedIndex = index;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (filteredTabs.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredTabs.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredTabs.length) % filteredTabs.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredTabs[selectedIndex]) {
                handleSelect(filteredTabs[selectedIndex].id);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    }

    function scrollIntoView(node: HTMLElement, isSelected: boolean) {
        if (isSelected) {
            node.scrollIntoView({ block: 'nearest' });
        }
        return {
            update(newIsSelected: boolean) {
                if (newIsSelected) {
                    node.scrollIntoView({ block: 'nearest' });
                }
            },
        };
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-40" role="presentation" onclick={onClose}></div>
    <div
        class="bg-bg-panel border-border-light absolute top-full left-0 z-50 mt-1 flex max-h-[calc(100vh-120px)] w-80 flex-col rounded-lg border shadow-2xl"
        role="menu"
    >
        <div class="border-border-light shrink-0 border-b p-2">
            <input
                bind:this={searchInputRef}
                bind:value={searchQuery}
                type="text"
                placeholder="Filter tabs..."
                class="text-fg-default w-full bg-transparent px-2 py-1 text-sm outline-none"
                onkeydown={handleKeydown}
            />
        </div>

        <div class="relative min-h-0 flex-1">
            <div
                bind:this={dropdownListRef}
                class="dropdown-list overflow-y-auto py-1"
                style="max-height: 60vh;"
            >
                {#each filteredTabs as tab, index (tab.id)}
                    {@const isSelected = index === selectedIndex}
                    {@const isActive = appContext.app.activeTabId === tab.id}
                    <div
                        role="none"
                        class="group flex w-full items-stretch {isSelected
                            ? 'bg-accent-primary'
                            : 'bg-transparent'}"
                        onmousemove={(e) => handleHover(index, e)}
                        use:scrollIntoView={isSelected}
                    >
                        <button
                            type="button"
                            class="flex flex-1 items-center gap-2 overflow-hidden px-3 py-2 text-left text-sm outline-none {isSelected
                                ? 'text-fg-inverse'
                                : isActive
                                  ? 'text-accent-secondary'
                                  : 'text-fg-default'}"
                            onclick={() => handleSelect(tab.id)}
                            role="menuitem"
                            use:tooltip={getTooltipContent(tab)}
                        >
                            {#if tab.fileCheckFailed}
                                <CircleAlert size={14} class="text-danger-text shrink-0" />
                            {:else if !tab.path}
                                {#if tab.content.length > 0}
                                    <PencilLine
                                        size={14}
                                        class="shrink-0"
                                        style="color: {isActive && tab.isDirty
                                            ? '#5deb47'
                                            : isSelected
                                              ? 'var(--color-fg-inverse)'
                                              : 'var(--color-fg-muted)'};"
                                    />
                                {:else}
                                    <Pencil
                                        size={14}
                                        class="shrink-0 {isSelected
                                            ? 'text-fg-inverse'
                                            : 'text-fg-muted'}"
                                    />
                                {/if}
                            {:else if tab.isDirty}
                                <SquarePen
                                    size={14}
                                    class="shrink-0"
                                    style="color: {isActive && tab.isDirty
                                        ? '#5deb47'
                                        : isSelected
                                          ? 'var(--color-fg-inverse)'
                                          : 'var(--color-accent-secondary)'}"
                                />
                            {:else}
                                <FileText
                                    size={14}
                                    class="shrink-0 {isSelected
                                        ? 'text-fg-inverse'
                                        : 'text-fg-muted'}"
                                />
                            {/if}

                            <span class="flex-1 truncate">{getDropdownTitle(tab)}</span>

                            {#if tab.isPinned}
                                <Pin
                                    size={12}
                                    class="ml-1 shrink-0 {isSelected
                                        ? 'text-fg-inverse'
                                        : 'text-accent-secondary'}"
                                />
                            {/if}
                        </button>

                        <button
                            type="button"
                            class="flex shrink-0 items-center justify-center px-3 transition-colors outline-none {tab.isPinned
                                ? 'text-fg-muted cursor-not-allowed opacity-30'
                                : isSelected
                                  ? 'text-fg-inverse hover:text-danger-text hover:bg-black/40'
                                  : 'text-fg-muted hover:text-danger-text hover:bg-black/30'}"
                            disabled={tab.isPinned}
                            onclick={(e) => {
                                e.stopPropagation();
                                requestCloseTab(tab.id);
                            }}
                            aria-label="Close tab"
                        >
                            <X size={14} />
                        </button>
                    </div>
                {/each}
            </div>
            {#if dropdownListRef}
                <CustomScrollbar viewport={dropdownListRef} content={dropdownListRef} />
            {/if}
        </div>
    </div>
{/if}

<style>
    input::placeholder {
        color: var(--color-fg-muted);
        opacity: 0.5;
    }
</style>
