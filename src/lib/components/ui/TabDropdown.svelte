<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { CircleAlert, FileText, Pencil, PencilLine } from "lucide-svelte";
    import { tick } from "svelte";
    import CustomScrollbar from "./CustomScrollbar.svelte";

    let {
        isOpen = false,
        onSelect,
        onClose,
    } = $props<{
        isOpen: boolean;
        onSelect: (id: string) => void;
        onClose: () => void;
    }>();

    let searchQuery = $state("");
    let selectedIndex = $state(0);
    let searchInputRef = $state<HTMLInputElement>();
    let dropdownListRef = $state<HTMLDivElement>();
    let dropdownContainerRef = $state<HTMLDivElement>();
    let lastClientX = 0;
    let lastClientY = 0;

    let filteredTabs = $derived.by(() => {
        const tabs = editorStore.tabs;
        if (searchQuery.trim() === "") {
            return tabs;
        }
        const query = searchQuery.toLowerCase();
        return tabs.filter((tab) => {
            return (tab.customTitle || tab.title).toLowerCase().includes(query) || (tab.path || "").toLowerCase().includes(query);
        });
    });

    // Get a longer display title for the dropdown
    function getDropdownTitle(tab: any): string {
        // If it has a custom title, use it
        if (tab.customTitle) return tab.customTitle;

        // If it has a path, show the filename
        if (tab.path) {
            const parts = tab.path.split(/[\\\/]/);
            return parts[parts.length - 1] || tab.title;
        }

        // For unsaved tabs, extract first line from content (up to 60 chars)
        if (tab.content) {
            const lines = tab.content.split("\n");
            const firstLine = lines.find((l: string) => l.trim().length > 0) || "";
            let displayTitle = firstLine.replace(/^#+\s*/, "").trim();
            const MAX_LEN = 60;
            if (displayTitle.length > MAX_LEN) {
                displayTitle = displayTitle.substring(0, MAX_LEN).trim() + "...";
            }
            return displayTitle.length > 0 ? displayTitle : tab.title;
        }

        return tab.title;
    }

    $effect(() => {
        if (isOpen) {
            lastClientX = 0;
            lastClientY = 0;
            searchQuery = "";
            selectedIndex = 0;
            setTimeout(() => searchInputRef?.focus(), 50);
        }
    });

    function handleSelect(id: string) {
        onSelect(id);
    }

    function handleHover(index: number, e: MouseEvent) {
        if (e.clientX === lastClientX && e.clientY === lastClientY) return;

        lastClientX = e.clientX;
        lastClientY = e.clientY;
        selectedIndex = index;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (filteredTabs.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredTabs.length;
            scrollToSelectedItem(selectedIndex);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredTabs.length) % filteredTabs.length;
            scrollToSelectedItem(selectedIndex);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredTabs[selectedIndex]) {
                handleSelect(filteredTabs[selectedIndex].id);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }

    async function scrollToSelectedItem(index: number) {
        await tick();
        if (!dropdownListRef) return;

        const buttons = dropdownListRef.querySelectorAll('button[role="menuitem"]');
        const selectedButton = buttons[index] as HTMLElement;

        if (selectedButton) {
            const container = dropdownListRef;
            const itemTop = selectedButton.offsetTop;
            const itemBottom = itemTop + selectedButton.offsetHeight;
            const containerTop = container.scrollTop;
            const containerBottom = containerTop + container.clientHeight;

            if (itemTop < containerTop) {
                container.scrollTop = itemTop;
            } else if (itemBottom > containerBottom) {
                container.scrollTop = itemBottom - container.clientHeight;
            }
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={onClose}></div>
    <div
        bind:this={dropdownContainerRef}
        class="absolute left-0 top-full mt-1 w-80 rounded-lg shadow-2xl border flex flex-col z-50"
        style="
            background-color: var(--color-bg-panel);
            border-color: var(--color-border-light);
            max-height: calc(100vh - 120px);
        "
        role="menu"
    >
        <div class="p-2 border-b shrink-0" style="border-color: var(--color-border-light);">
            <input bind:this={searchInputRef} bind:value={searchQuery} type="text" placeholder="Filter tabs..." class="w-full bg-transparent outline-none px-2 py-1 text-sm" style="color: var(--color-fg-default);" onkeydown={handleKeydown} />
        </div>

        <div class="relative min-h-0 flex-1">
            <div bind:this={dropdownListRef} class="dropdown-list overflow-y-auto py-1" style="max-height: 60vh;">
                {#each filteredTabs as tab, index (tab.id)}
                    {@const isSelected = index === selectedIndex}
                    {@const isActive = appState.activeTabId === tab.id}
                    <button
                        type="button"
                        class="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                        style="
                            background-color: {isSelected ? 'var(--color-accent-primary)' : 'transparent'};
                            color: {isSelected ? 'var(--color-fg-inverse)' : isActive ? 'var(--color-accent-secondary)' : 'var(--color-fg-default)'};
                        "
                        onclick={() => handleSelect(tab.id)}
                        onmousemove={(e) => handleHover(index, e)}
                        role="menuitem"
                    >
                        {#if tab.fileCheckFailed}
                            <CircleAlert size={14} class="shrink-0" style="color: var(--color-danger-text);" />
                        {:else if !tab.path && tab.isDirty}
                            <PencilLine size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : '#5deb47'};" />
                        {:else if !tab.path}
                            <Pencil size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-fg-muted)'};" />
                        {:else if tab.isDirty}
                            <PencilLine size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : '#5deb47'};" />
                        {:else}
                            <FileText size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-fg-muted)'};" />
                        {/if}
                        <span class="truncate flex-1" title={tab.path || "Unsaved content"}>{getDropdownTitle(tab)}</span>
                    </button>
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

    .dropdown-list {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .dropdown-list::-webkit-scrollbar {
        display: none;
    }
</style>
