<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { AlertCircle, File, FileText, Pencil } from "lucide-svelte";
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
        const tabs = editorStore.tabs; // Access reactive state
        if (searchQuery.trim() === "") {
            return tabs;
        }
        const query = searchQuery.toLowerCase();
        return tabs.filter((tab) => {
            return (tab.customTitle || tab.title).toLowerCase().includes(query) || (tab.path || "").toLowerCase().includes(query);
        });
    });

    $effect(() => {
        if (isOpen) {
            // Reset tracking and search on open
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
        // Prevent scroll from triggering selection changes
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
            background-color: var(--bg-panel);
            border-color: var(--border-light);
            max-height: calc(100vh - 120px);
        "
        role="menu"
    >
        <div class="p-2 border-b shrink-0" style="border-color: var(--border-light);">
            <input bind:this={searchInputRef} bind:value={searchQuery} type="text" placeholder="Filter tabs..." class="w-full bg-transparent outline-none px-2 py-1 text-sm" style="color: var(--fg-default);" onkeydown={handleKeydown} />
        </div>

        <div class="relative min-h-0 flex-1">
            <div bind:this={dropdownListRef} class="overflow-y-auto py-1" style="scrollbar-width: none; max-height: 60vh;">
                {#each filteredTabs as tab, index (tab.id)}
                    {@const isSelected = index === selectedIndex}
                    {@const isActive = appState.activeTabId === tab.id}
                    <button
                        type="button"
                        class="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                        style="
                            background-color: {isSelected ? 'var(--accent-primary)' : 'transparent'};
                            color: {isSelected ? 'var(--fg-inverse)' : isActive ? 'var(--accent-secondary)' : 'var(--fg-default)'};
                        "
                        onclick={() => handleSelect(tab.id)}
                        onmousemove={(e) => handleHover(index, e)}
                        role="menuitem"
                    >
                        {#if tab.fileCheckFailed}
                            <AlertCircle size={14} class="shrink-0" style="color: var(--danger-text);" />
                        {:else if tab.path && tab.isDirty}
                            <Pencil size={14} class="shrink-0" style="color: {isSelected ? 'var(--fg-inverse)' : '#5deb47'};" />
                        {:else if tab.path}
                            <FileText size={14} class="shrink-0" style="color: {isSelected ? 'var(--fg-inverse)' : 'var(--fg-muted)'};" />
                        {:else}
                            <File size={14} class="shrink-0" style="color: {isSelected ? 'var(--fg-inverse)' : 'var(--fg-muted)'};" />
                        {/if}
                        <span class="truncate flex-1">{tab.customTitle || tab.title}</span>
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
        color: var(--fg-muted);
        opacity: 0.5;
    }

    /* Hide native scrollbar */
    div[bind\:this="{dropdownListRef}"] {
        scrollbar-width: none;
    }

    div[bind\:this="{dropdownListRef}"]::-webkit-scrollbar {
        display: none;
    }
</style>
