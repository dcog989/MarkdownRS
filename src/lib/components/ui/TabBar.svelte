<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { AlertCircle, ChevronDown, File, FileText, Pencil, Plus } from "lucide-svelte";
    import { onMount, tick } from "svelte";
    import CustomScrollbar from "./CustomScrollbar.svelte";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";

    let scrollContainer: HTMLDivElement;
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());
    let tabSearchQuery = $state("");
    let searchInputRef = $state<HTMLInputElement>();
    let selectedDropdownIndex = $state(0);
    let dropdownListRef = $state<HTMLDivElement>();

    let draggedTabId: string | null = $state(null);
    let draggedOverTabId: string | null = $state(null);

    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    let showMruPopup = $state(false);
    let mruPopupTimeout: number | null = null;
    let mruCleanupTimeout: number | null = null;
    let tabKeyHeld = $state(false);

    // Track mouse position to prevent scroll-induced hover events
    let lastClientX = 0;
    let lastClientY = 0;

    onMount(() => {
        const appWindow = getCurrentWindow();
        let unlisten: (() => void) | undefined;

        appWindow.onResized(() => {}).then((u) => (unlisten = u));

        const interval = setInterval(() => {
            currentTime = Date.now();
        }, 60000);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                if (!tabKeyHeld) {
                    tabKeyHeld = true;
                    if (editorStore.mruStack.length >= 2) {
                        const lastUsedTab = editorStore.mruStack[1];
                        if (lastUsedTab && lastUsedTab !== appState.activeTabId) {
                            appState.activeTabId = lastUsedTab;
                        }
                    }
                    if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
                    mruPopupTimeout = window.setTimeout(() => {
                        if (tabKeyHeld) showMruPopup = true;
                    }, 200);
                } else {
                    cycleNextMru();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && tabKeyHeld) {
                tabKeyHeld = false;
                if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
                if (appState.activeTabId) editorStore.pushToMru(appState.activeTabId);
                if (mruCleanupTimeout) clearTimeout(mruCleanupTimeout);
                mruCleanupTimeout = window.setTimeout(() => (showMruPopup = false), 100);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            if (unlisten) unlisten();
            clearInterval(interval);
            if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
            if (mruCleanupTimeout) clearTimeout(mruCleanupTimeout);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    });

    function cycleNextMru() {
        if (editorStore.mruStack.length < 2) return;
        const currentActive = appState.activeTabId;
        const currentIndex = editorStore.mruStack.findIndex((id) => id === currentActive);
        const nextIndex = (currentIndex + 1) % editorStore.mruStack.length;
        const nextTabId = editorStore.mruStack[nextIndex];
        if (nextTabId && nextTabId !== currentActive) {
            appState.activeTabId = nextTabId;
        }
    }

    async function scrollToActive() {
        await tick();
        setTimeout(() => {
            if (!scrollContainer) return;
            const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
            if (!activeEl) return;

            const containerRect = scrollContainer.getBoundingClientRect();
            const tabRect = activeEl.getBoundingClientRect();
            const relativeLeft = tabRect.left - containerRect.left;
            const relativeRight = tabRect.right - containerRect.left;
            const containerWidth = containerRect.width;
            const currentScroll = scrollContainer.scrollLeft;
            const absTabLeft = currentScroll + relativeLeft;
            const absTabRight = currentScroll + relativeRight;

            const nextEl = activeEl.nextElementSibling as HTMLElement;
            const prevEl = activeEl.previousElementSibling as HTMLElement;
            const hasNext = nextEl && (nextEl.hasAttribute("data-tab-id") || nextEl.tagName === "BUTTON");
            const hasPrev = prevEl && prevEl.hasAttribute("data-tab-id");
            const PEEK = 40;

            let targetScroll = currentScroll;
            const minScrollForRight = absTabRight + (hasNext ? PEEK : 0) - containerWidth;
            const maxScrollForLeft = absTabLeft - (hasPrev ? PEEK : 0);

            if (targetScroll < minScrollForRight) targetScroll = minScrollForRight;
            if (targetScroll > maxScrollForLeft) targetScroll = maxScrollForLeft;

            const maxPossibleScroll = scrollContainer.scrollWidth - containerWidth;
            targetScroll = Math.max(0, Math.min(targetScroll, maxPossibleScroll));

            if (Math.abs(currentScroll - targetScroll) > 1) {
                scrollContainer.scrollTo({ left: targetScroll, behavior: "smooth" });
            }
        }, 50);
    }

    $effect(() => {
        if (appState.activeTabId) scrollToActive();
    });

    function handleTabClick(id: string) {
        appState.activeTabId = id;
        editorStore.pushToMru(id);
    }

    function handleNewTab() {
        const newId = editorStore.addTab(`Untitled-${editorStore.tabs.length + 1}`);
        appState.activeTabId = newId;
    }

    function handleCloseTab(e: MouseEvent, tabId: string) {
        const tab = editorStore.tabs.find((t) => t.id === tabId);
        if (tab?.isPinned) return;
        requestCloseTab(tabId);
    }

    function closeContextMenu() {
        contextMenuTabId = null;
    }

    function handleTabContextMenu(e: MouseEvent, tabId: string) {
        e.preventDefault();
        e.stopPropagation();
        contextMenuTabId = tabId;
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
    }

    function handleDragStart(e: DragEvent, tabId: string) {
        if (!e.dataTransfer) return;
        draggedTabId = tabId;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tabId);
    }

    function handleDragOver(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;
        draggedOverTabId = tabId;
    }

    function handleDragEnter(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;
        draggedOverTabId = tabId;
    }

    function handleDragLeave(e: DragEvent, tabId: string) {
        if (draggedOverTabId === tabId) draggedOverTabId = null;
    }

    function handleDrop(e: DragEvent, targetTabId: string) {
        if (!draggedTabId || draggedTabId === targetTabId) {
            draggedTabId = null;
            draggedOverTabId = null;
            return;
        }
        const fromIndex = editorStore.tabs.findIndex((t) => t.id === draggedTabId);
        const toIndex = editorStore.tabs.findIndex((t) => t.id === targetTabId);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
            const tabs = [...editorStore.tabs];
            const [movedTab] = tabs.splice(fromIndex, 1);
            tabs.splice(toIndex, 0, movedTab);
            editorStore.tabs = tabs;
            editorStore.sessionDirty = true;
        }
        draggedTabId = null;
        draggedOverTabId = null;
    }

    function handleDragEnd() {
        draggedTabId = null;
        draggedOverTabId = null;
    }

    function toggleDropdown() {
        showDropdown = !showDropdown;
        if (showDropdown) {
            selectedDropdownIndex = 0;
            // Reset tracking so we don't immediately select what's under mouse
            lastClientX = 0;
            lastClientY = 0;
            setTimeout(() => searchInputRef?.focus(), 50);
        } else {
            tabSearchQuery = "";
        }
    }

    function handleDropdownSelect(id: string) {
        handleTabClick(id);
        showDropdown = false;
    }

    function handleDropdownHover(index: number, e: MouseEvent) {
        // Prevent scroll from triggering selection changes
        // Only update if the mouse actually moved
        if (e.clientX === lastClientX && e.clientY === lastClientY) return;

        lastClientX = e.clientX;
        lastClientY = e.clientY;
        selectedDropdownIndex = index;
    }

    function handleDropdownKeydown(e: KeyboardEvent) {
        if (filteredTabs.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedDropdownIndex = (selectedDropdownIndex + 1) % filteredTabs.length;
            scrollToSelectedDropdownItem();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedDropdownIndex = (selectedDropdownIndex - 1 + filteredTabs.length) % filteredTabs.length;
            scrollToSelectedDropdownItem();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredTabs[selectedDropdownIndex]) handleDropdownSelect(filteredTabs[selectedDropdownIndex].id);
        } else if (e.key === "Escape") {
            e.preventDefault();
            toggleDropdown();
        }
    }

    async function scrollToSelectedDropdownItem() {
        await tick();
        if (!dropdownListRef) return;
        const buttons = dropdownListRef.querySelectorAll('button[role="menuitem"]');
        const selectedButton = buttons[selectedDropdownIndex] as HTMLElement;
        if (selectedButton) {
            const container = dropdownListRef;
            const itemTop = selectedButton.offsetTop;
            const itemBottom = itemTop + selectedButton.offsetHeight;
            const containerTop = container.scrollTop;
            const containerBottom = containerTop + container.clientHeight;
            if (itemTop < containerTop) container.scrollTop = itemTop;
            else if (itemBottom > containerBottom) container.scrollTop = itemBottom - container.clientHeight;
        }
    }

    function handleMruSelect(tabId: string) {
        appState.activeTabId = tabId;
        editorStore.pushToMru(tabId);
    }

    let tabCount = $derived(editorStore.tabs.length);
    let filteredTabs = $derived(
        tabSearchQuery.trim() === ""
            ? editorStore.tabs
            : editorStore.tabs.filter((tab) => {
                  const query = tabSearchQuery.toLowerCase();
                  return (tab.customTitle || tab.title).toLowerCase().includes(query) || (tab.path || "").toLowerCase().includes(query);
              })
    );

    function getTabNumber(tabId: string): number {
        return editorStore.tabs.findIndex((t) => t.id === tabId) + 1;
    }
</script>

<div class="h-9 flex items-end w-full border-b relative shrink-0 tab-bar-container" style="background-color: var(--bg-panel); border-color: var(--border-main);">
    <div class="relative h-8 border-r border-[var(--border-main)]">
        <button class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--fg-muted)] text-xs" onclick={toggleDropdown}>
            <span>{tabCount}</span>
            <ChevronDown size={12} />
        </button>
        {#if showDropdown}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0 z-40" onclick={toggleDropdown}></div>
            <div class="absolute left-0 top-full mt-1 w-80 max-h-[calc(100vh-100px)] rounded-lg shadow-2xl border overflow-hidden flex flex-col z-50" style="background-color: var(--bg-panel); border-color: var(--border-light);" role="menu">
                <div class="p-2 border-b" style="border-color: var(--border-light);">
                    <input bind:this={searchInputRef} bind:value={tabSearchQuery} type="text" placeholder="Filter tabs..." class="w-full bg-transparent outline-none px-2 py-1 text-sm" style="color: var(--fg-default);" onkeydown={handleDropdownKeydown} />
                </div>

                <!-- Wrapper for Custom Scrollbar -->
                <div class="relative min-h-0 flex-1">
                    <div bind:this={dropdownListRef} class="overflow-y-auto py-1 no-scrollbar relative h-full">
                        {#each filteredTabs as tab, index (tab.id)}
                            {@const isSelected = index === selectedDropdownIndex}
                            {@const isActive = appState.activeTabId === tab.id}
                            <button
                                type="button"
                                class="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                                style="
                                    background-color: {isSelected ? 'var(--accent-primary)' : 'transparent'};
                                    color: {isSelected ? 'var(--fg-inverse)' : isActive ? 'var(--accent-secondary)' : 'var(--fg-default)'};
                                "
                                onclick={() => handleDropdownSelect(tab.id)}
                                onmousemove={(e) => handleDropdownHover(index, e)}
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
                    <!-- Pass content={dropdownListRef} to trigger update on resize -->
                    <CustomScrollbar viewport={dropdownListRef} content={dropdownListRef} />
                </div>
            </div>
        {/if}
    </div>

    <div bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full tab-scroll-container">
        {#each editorStore.tabs as tab (tab.id)}
            <TabButton {tab} isActive={appState.activeTabId === tab.id} index={getTabNumber(tab.id)} {draggedTabId} {draggedOverTabId} {currentTime} onclick={(id) => handleTabClick(id)} onclose={handleCloseTab} oncontextmenu={handleTabContextMenu} ondragstart={handleDragStart} ondragover={handleDragOver} ondragenter={handleDragEnter} ondragleave={handleDragLeave} ondrop={handleDrop} ondragend={handleDragEnd} />
        {/each}
        <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--fg-muted)] shrink-0" onclick={handleNewTab}>
            <Plus size={16} />
        </button>
    </div>
</div>

{#if contextMenuTabId}
    <TabContextMenu tabId={contextMenuTabId} x={contextMenuX} y={contextMenuY} onClose={closeContextMenu} />
{/if}

<MruTabsPopup isOpen={showMruPopup} onClose={() => (showMruPopup = false)} onSelect={handleMruSelect} currentActiveId={appState.activeTabId} />

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .tab-bar-container,
    .tab-scroll-container {
        -webkit-app-region: no-drag;
    }
    input::placeholder {
        color: var(--fg-muted);
        opacity: 0.5;
    }
</style>
