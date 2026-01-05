<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";
    import { CircleAlert, FileText, Pencil, PencilLine, SquarePen } from "lucide-svelte";
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
    let ignoreMouseMovement = $state(false);
    let mouseMovementTimer: number | null = null;

    let filteredTabs = $derived.by(() => {
        const tabs = appContext.editor.tabs;
        if (searchQuery.trim() === "") {
            return tabs;
        }
        const query = searchQuery.toLowerCase();
        return tabs.filter((tab) => {
            return (tab.customTitle || tab.title).toLowerCase().includes(query) || (tab.path || "").toLowerCase().includes(query);
        });
    });

    function getDropdownTitle(tab: any): string {
        return tab.customTitle || tab.title;
    }

    function getTooltipContent(tab: any): string {
        const parts: string[] = [];
        const sizeStr = formatFileSize(tab.sizeBytes || 0);
        const formattedTime = tab.formattedTimestamp || "";
        const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

        if (tab.fileCheckFailed) {
            parts.push("File missing from original location");
            if (tab.path) parts.push(tab.path);
        } else {
            parts.push(tab.path || "Unsaved content");
        }
        parts.push(bottomLine);
        return parts.join("\n");
    }

    $effect(() => {
        if (isOpen) {
            lastClientX = 0;
            lastClientY = 0;
            searchQuery = "";
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

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredTabs.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredTabs.length) % filteredTabs.length;
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

    function scrollIntoView(node: HTMLElement, isSelected: boolean) {
        if (isSelected) {
            node.scrollIntoView({ block: "nearest" });
        }
        return {
            update(newIsSelected: boolean) {
                if (newIsSelected) {
                    node.scrollIntoView({ block: "nearest" });
                }
            },
        };
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={onClose}></div>
    <div bind:this={dropdownContainerRef} class="absolute left-0 top-full mt-1 w-80 rounded-lg shadow-2xl border flex flex-col z-50 bg-bg-panel border-border-light max-h-[calc(100vh-120px)]" role="menu">
        <div class="p-2 border-b shrink-0 border-border-light">
            <input bind:this={searchInputRef} bind:value={searchQuery} type="text" placeholder="Filter tabs..." class="w-full bg-transparent outline-none px-2 py-1 text-sm text-fg-default" onkeydown={handleKeydown} />
        </div>

        <div class="relative min-h-0 flex-1">
            <div bind:this={dropdownListRef} class="dropdown-list overflow-y-auto py-1" style="max-height: 60vh;">
                {#each filteredTabs as tab, index (tab.id)}
                    {@const isSelected = index === selectedIndex}
                    {@const isActive = appContext.app.activeTabId === tab.id}
                    <button type="button" class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 {isSelected ? 'bg-accent-primary text-fg-inverse' : 'bg-transparent'} {isSelected ? '' : isActive ? 'text-accent-secondary' : 'text-fg-default'}" onclick={() => handleSelect(tab.id)} onmousemove={(e) => handleHover(index, e)} role="menuitem" use:scrollIntoView={isSelected} use:tooltip={getTooltipContent(tab)}>
                        {#if tab.fileCheckFailed}
                            <CircleAlert size={14} class="shrink-0 text-danger-text" />
                        {:else if !tab.path && tab.isDirty}
                            <PencilLine size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : '#5deb47'};" />
                        {:else if !tab.path}
                            <Pencil size={14} class="shrink-0 {isSelected ? 'text-fg-inverse' : 'text-fg-muted'}" />
                        {:else if tab.isDirty}
                            <SquarePen size={14} class="shrink-0 {isSelected ? 'text-fg-inverse' : 'text-accent-secondary'}" />
                        {:else}
                            <FileText size={14} class="shrink-0 {isSelected ? 'text-fg-inverse' : 'text-fg-muted'}" />
                        {/if}
                        <span class="truncate flex-1">{getDropdownTitle(tab)}</span>
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
</style>
