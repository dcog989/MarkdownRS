<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { AlertCircle, ChevronDown, File, FileText, Pencil, Pin, Plus, X } from "lucide-svelte";
    import { onMount, tick } from "svelte";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";

    let scrollContainer: HTMLDivElement;
    let showDropdown = $state(false);
    let currentTime = $state(Date.now()); // For reactive time-based updates
    let tabSearchQuery = $state("");
    let searchInputRef = $state<HTMLInputElement>();
    let selectedDropdownIndex = $state(0);
    let dropdownListRef = $state<HTMLDivElement>();

    // Drag and drop state
    let draggedTabId: string | null = $state(null);
    let draggedOverTabId: string | null = $state(null);

    // Context menu state
    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    // MRU popup state
    let showMruPopup = $state(false);
    let mruPopupTimeout: number | null = null;
    let mruCleanupTimeout: number | null = null;
    let tabKeyHeld = $state(false);

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
                    // Start of Ctrl+Tab sequence
                    tabKeyHeld = true;

                    // Switch to MRU[1] immediately (quick switch behavior)
                    if (editorStore.mruStack.length >= 2) {
                        const lastUsedTab = editorStore.mruStack[1];
                        if (lastUsedTab && lastUsedTab !== appState.activeTabId) {
                            appState.activeTabId = lastUsedTab;
                        }
                    }

                    // CRITICAL: Only show the MRU dialog if the user holds Ctrl for a moment.
                    // This prevents the visual noise of the popup flashing during a quick toggle.
                    if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
                    mruPopupTimeout = window.setTimeout(() => {
                        if (tabKeyHeld) {
                            showMruPopup = true;
                        }
                    }, 200); // 200ms delay
                } else {
                    // Already holding Ctrl and popup is likely showing (or about to), cycle
                    cycleNextMru();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && tabKeyHeld) {
                tabKeyHeld = false;

                // Clear the delay timer so popup doesn't appear if released quickly
                if (mruPopupTimeout) {
                    clearTimeout(mruPopupTimeout);
                    mruPopupTimeout = null;
                }

                // When Ctrl is released, commit the selection to MRU
                if (appState.activeTabId) {
                    editorStore.pushToMru(appState.activeTabId);
                }

                // Close popup
                if (mruCleanupTimeout) clearTimeout(mruCleanupTimeout);
                mruCleanupTimeout = window.setTimeout(() => {
                    showMruPopup = false;
                }, 100);
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

            // Use getBoundingClientRect to calculate positions independent of offsetParent hierarchies
            const containerRect = scrollContainer.getBoundingClientRect();
            const tabRect = activeEl.getBoundingClientRect();

            // Calculate visual position relative to the container's visible area
            const relativeLeft = tabRect.left - containerRect.left;
            const relativeRight = tabRect.right - containerRect.left;
            const containerWidth = containerRect.width;

            const currentScroll = scrollContainer.scrollLeft;

            // Calculate absolute position within the scrollable content
            const absTabLeft = currentScroll + relativeLeft;
            const absTabRight = currentScroll + relativeRight;

            // Check for adjacent elements
            const nextEl = activeEl.nextElementSibling as HTMLElement;
            const prevEl = activeEl.previousElementSibling as HTMLElement;

            const hasNext = nextEl && (nextEl.hasAttribute("data-tab-id") || nextEl.tagName === "BUTTON");
            const hasPrev = prevEl && prevEl.hasAttribute("data-tab-id");

            const PEEK = 40; // Pixels to show of adjacent tab

            let targetScroll = currentScroll;

            // 1. Calculate required scroll to satisfy Right Edge constraints
            // We want (AbsoluteRight + Peek) to be <= (TargetScroll + Width)
            // Therefore: TargetScroll >= AbsoluteRight + Peek - Width
            const minScrollForRight = absTabRight + (hasNext ? PEEK : 0) - containerWidth;

            // 2. Calculate required scroll to satisfy Left Edge constraints
            // We want (AbsoluteLeft - Peek) to be >= TargetScroll
            // Therefore: TargetScroll <= AbsoluteLeft - Peek
            const maxScrollForLeft = absTabLeft - (hasPrev ? PEEK : 0);

            // Apply constraints
            // If current scroll is too far left (hiding right side), push it right
            if (targetScroll < minScrollForRight) {
                targetScroll = minScrollForRight;
            }

            // If current/new scroll is too far right (hiding left side), push it left
            // This takes priority to ensure the start of the tab is always visible
            if (targetScroll > maxScrollForLeft) {
                targetScroll = maxScrollForLeft;
            }

            // Clamp to valid bounds
            const maxPossibleScroll = scrollContainer.scrollWidth - containerWidth;
            targetScroll = Math.max(0, Math.min(targetScroll, maxPossibleScroll));

            // Only scroll if difference is noticeable
            if (Math.abs(currentScroll - targetScroll) > 1) {
                scrollContainer.scrollTo({
                    left: targetScroll,
                    behavior: "smooth",
                });
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
        if (appState.newTabPosition === "right") {
            const currentIndex = editorStore.tabs.findIndex((t) => t.id === appState.activeTabId);
            if (currentIndex !== -1) {
                const newTab = editorStore.tabs.find((t) => t.id === newId);
                if (newTab) {
                    editorStore.tabs = editorStore.tabs.filter((t) => t.id !== newId);
                    editorStore.tabs.splice(currentIndex + 1, 0, newTab);
                }
            }
        }
        appState.activeTabId = newId;
    }

    function handleCloseTab(e: Event, id: string) {
        e.stopPropagation();
        e.preventDefault();
        const tab = editorStore.tabs.find((t) => t.id === id);
        if (tab?.isPinned) return;
        requestCloseTab(id);
    }

    function handleTabContextMenu(e: MouseEvent, id: string) {
        e.preventDefault();
        e.stopPropagation();
        contextMenuTabId = id;
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
    }

    function closeContextMenu() {
        contextMenuTabId = null;
    }

    function handleDropdownSelect(id: string) {
        handleTabClick(id);
        showDropdown = false;
        tabSearchQuery = "";
        selectedDropdownIndex = 0;
    }

    function toggleDropdown() {
        showDropdown = !showDropdown;
        if (showDropdown) {
            selectedDropdownIndex = 0;
            setTimeout(() => searchInputRef?.focus(), 50);
        } else {
            tabSearchQuery = "";
            selectedDropdownIndex = 0;
        }
    }

    let filteredTabs = $derived(
        tabSearchQuery.trim() === ""
            ? editorStore.tabs
            : editorStore.tabs.filter((tab) => {
                  const query = tabSearchQuery.toLowerCase();
                  const title = (tab.customTitle || tab.title).toLowerCase();
                  const path = (tab.path || "").toLowerCase();
                  return title.includes(query) || path.includes(query);
              })
    );

    // Reset selected index when filtered tabs change
    $effect(() => {
        if (filteredTabs.length > 0 && selectedDropdownIndex >= filteredTabs.length) {
            selectedDropdownIndex = 0;
        }
    });

    async function scrollToSelectedDropdownItem() {
        await tick();
        if (!dropdownListRef) return;

        const buttons = dropdownListRef.querySelectorAll('button[role="menuitem"]');
        const selectedButton = buttons[selectedDropdownIndex] as HTMLElement;

        if (selectedButton) {
            const container = dropdownListRef;

            // Get positions relative to the container (requires container to be positioned relative)
            const itemTop = selectedButton.offsetTop;
            const itemBottom = itemTop + selectedButton.offsetHeight;
            const containerTop = container.scrollTop;
            const containerBottom = containerTop + container.clientHeight;

            // Scroll up if item is above visible area
            if (itemTop < containerTop) {
                container.scrollTop = itemTop;
            }
            // Scroll down if item is below visible area
            else if (itemBottom > containerBottom) {
                container.scrollTop = itemBottom - container.clientHeight;
            }
        }
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
            if (filteredTabs[selectedDropdownIndex]) {
                handleDropdownSelect(filteredTabs[selectedDropdownIndex].id);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            toggleDropdown();
        }
    }

    function handleMruSelect(tabId: string) {
        appState.activeTabId = tabId;
        editorStore.pushToMru(tabId);
    }

    function handleDragStart(e: DragEvent, tabId: string) {
        if (!e.dataTransfer) return;
        const tab = editorStore.tabs.find((t) => t.id === tabId);
        if (tab?.isPinned) {
            e.preventDefault();
            return;
        }

        draggedTabId = tabId;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tabId);

        const target = e.currentTarget as HTMLElement;
        if (target) {
            target.style.opacity = "0.4";
        }
    }

    function handleDragOver(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;

        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "move";
        }

        draggedOverTabId = tabId;
    }

    function handleDragEnter(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;
        e.preventDefault();
        draggedOverTabId = tabId;
    }

    function handleDragLeave(e: DragEvent, tabId: string) {
        const relatedTarget = e.relatedTarget as HTMLElement;
        const currentTarget = e.currentTarget as HTMLElement;

        if (relatedTarget && currentTarget.contains(relatedTarget)) {
            return;
        }

        if (draggedOverTabId === tabId) {
            draggedOverTabId = null;
        }
    }

    function handleDrop(e: DragEvent, targetTabId: string) {
        e.preventDefault();
        e.stopPropagation();

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

            const adjustedToIndex = fromIndex < toIndex ? toIndex : toIndex;
            tabs.splice(adjustedToIndex, 0, movedTab);

            editorStore.tabs = tabs;
            editorStore.sessionDirty = true;
        }

        draggedTabId = null;
        draggedOverTabId = null;
    }

    function handleDragEnd(e: DragEvent) {
        const target = e.currentTarget as HTMLElement;
        if (target) {
            target.style.opacity = "1";
        }
        draggedTabId = null;
        draggedOverTabId = null;
    }

    function getIconColor(tab: EditorTab, isActive: boolean): string {
        const _ = currentTime;

        if (!tab.modified) return isActive ? "#ffffff" : "var(--fg-muted)";

        const parts = tab.modified.split(" / ");
        if (parts.length !== 2) return isActive ? "#ffffff" : "var(--fg-muted)";

        const dStr = parts[0];
        const tStr = parts[1];

        const year = parseInt(dStr.substring(0, 4));
        const month = parseInt(dStr.substring(4, 6)) - 1;
        const day = parseInt(dStr.substring(6, 8));
        const hour = parseInt(tStr.substring(0, 2));
        const min = parseInt(tStr.substring(2, 4));
        const sec = parseInt(tStr.substring(4, 6));

        const modDate = new Date(year, month, day, hour, min, sec);
        const now = new Date();
        const diffMs = now.getTime() - modDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 1) return "#5deb47";
        if (diffHours <= 24) return "#c2f7ba";

        return isActive ? "#ffffff" : "var(--fg-muted)";
    }

    let tabCount = $derived(editorStore.tabs.length);

    // Get tab number for a given tab ID
    function getTabNumber(tabId: string): number {
        return editorStore.tabs.findIndex((t) => t.id === tabId) + 1;
    }

    // Check if file exists for tabs with paths
    function isFileMissing(tab: EditorTab): boolean {
        return tab.fileCheckFailed === true;
    }
</script>

<div class="h-9 flex items-end w-full border-b relative shrink-0 tab-bar-container" style="background-color: var(--bg-panel); border-color: var(--border-main);">
    <!-- Tab Switcher Dropdown - Always Visible on Far Left -->
    <div class="relative h-8 border-r border-[var(--border-main)]">
        <button class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--fg-muted)] text-xs" onclick={toggleDropdown} aria-label={`${tabCount} tabs open`}>
            <span>{tabCount}</span>
            <ChevronDown size={12} />
        </button>

        {#if showDropdown}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0 z-40" onclick={toggleDropdown}></div>
            <div class="absolute left-0 top-full mt-1 w-80 max-h-[500px] rounded-lg shadow-2xl border overflow-hidden flex flex-col z-50" style="background-color: var(--bg-panel); border-color: var(--border-light);" role="menu">
                <!-- Search Input -->
                <div class="p-2 border-b" style="border-color: var(--border-light);">
                    <input bind:this={searchInputRef} bind:value={tabSearchQuery} type="text" placeholder="Filter tabs..." class="w-full bg-transparent outline-none px-2 py-1 text-sm" style="color: var(--fg-default);" onclick={(e) => e.stopPropagation()} onkeydown={handleDropdownKeydown} />
                </div>

                <!-- Tab List -->
                <div bind:this={dropdownListRef} class="overflow-y-auto py-1 relative">
                    {#if filteredTabs.length === 0}
                        <div class="px-3 py-4 text-sm text-center" style="color: var(--fg-muted);">No tabs match your search</div>
                    {:else}
                        {#each filteredTabs as tab, index}
                            <button
                                type="button"
                                class="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                                style="
                                    background-color: {index === selectedDropdownIndex ? 'var(--accent-primary)' : 'transparent'};
                                    color: {index === selectedDropdownIndex ? 'var(--fg-inverse)' : appState.activeTabId === tab.id ? 'var(--accent-secondary)' : 'var(--fg-default)'};
                                "
                                onclick={() => handleDropdownSelect(tab.id)}
                                onmouseenter={() => (selectedDropdownIndex = index)}
                                role="menuitem"
                            >
                                {#if isFileMissing(tab)}
                                    <AlertCircle size={14} style="color: {index === selectedDropdownIndex ? 'var(--fg-inverse)' : 'var(--danger-text)'};" />
                                {:else if tab.isPinned}
                                    <Pin size={14} />
                                {:else if tab.path && tab.isDirty}
                                    <Pencil size={14} />
                                {:else if tab.path}
                                    <FileText size={14} />
                                {:else}
                                    <File size={14} />
                                {/if}
                                <span class="truncate flex-1">{tab.customTitle || tab.title}</span>
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <div bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full tab-scroll-container">
        {#each editorStore.tabs as tab (tab.id)}
            {@const isActive = appState.activeTabId === tab.id}
            {@const iconColor = getIconColor(tab, isActive)}

            <div
                data-active={isActive}
                data-tab-index={getTabNumber(tab.id)}
                data-tab-id={tab.id}
                draggable={!tab.isPinned}
                class="tab-button group relative h-8 pl-2 pr-0 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden"
                style="
                    background-color: {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'};
                    color: {isActive ? 'var(--fg-default)' : 'var(--fg-muted)'};
                    border-color: var(--border-main);
                    border-top: 2px solid {isActive ? 'var(--accent-secondary)' : 'transparent'};
                    min-width: {appState.tabWidthMin}px;
                    max-width: {appState.tabWidthMax}px;
                    opacity: {draggedTabId === tab.id ? '0.5' : '1'};
                    {draggedOverTabId === tab.id ? 'border-left: 2px solid var(--accent-primary);' : ''}
                "
                role="button"
                tabindex="0"
                onclick={() => handleTabClick(tab.id)}
                oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
                ondragstart={(e) => handleDragStart(e, tab.id)}
                ondragover={(e) => handleDragOver(e, tab.id)}
                ondragenter={(e) => handleDragEnter(e, tab.id)}
                ondragleave={(e) => handleDragLeave(e, tab.id)}
                ondrop={(e) => handleDrop(e, tab.id)}
                ondragend={handleDragEnd}
                onkeydown={(e) => e.key === "Enter" && handleTabClick(tab.id)}
                aria-label={`${tab.title}${tab.isDirty ? " (modified)" : ""}${tab.isPinned ? " (pinned)" : ""}`}
            >
                <!-- File Type Icon -->
                {#if isFileMissing(tab)}
                    <AlertCircle size={14} class="flex-shrink-0" style="color: var(--danger-text);" />
                {:else if tab.path && tab.isDirty}
                    <Pencil size={14} class="flex-shrink-0" style="color: {iconColor}" />
                {:else if tab.path}
                    <FileText size={14} class="flex-shrink-0" style="color: {iconColor}" />
                {:else}
                    <File size={14} class="flex-shrink-0" style="color: {iconColor}" />
                {/if}

                <!-- Title (Full Width) -->
                <span class="truncate flex-1 w-full text-left">{tab.customTitle || tab.title}</span>

                <!-- Pin Icon (Static) -->
                {#if tab.isPinned}
                    <div class="w-6 flex items-center justify-center">
                        <Pin size={12} class="flex-shrink-0" style="color: {isActive ? 'var(--accent-secondary)' : 'var(--fg-muted)'}" />
                    </div>
                {/if}

                <!-- Close Button (Overlay on Right) -->
                {#if !tab.isPinned}
                    <div class="absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" style="background: linear-gradient(to right, transparent 0%, {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'} 30%);">
                        <span role="button" tabindex="0" class="p-0.5 rounded hover:bg-white/20 flex items-center justify-center" style="color: var(--fg-muted);" onclick={(e) => handleCloseTab(e, tab.id)} onkeydown={(e) => e.key === "Enter" && handleCloseTab(e, tab.id)} aria-label={`Close ${tab.title}`}>
                            <X size={12} class="hover:text-[var(--danger-text)]" />
                        </span>
                    </div>
                {/if}
            </div>
        {/each}

        <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--fg-muted)] shrink-0" onclick={handleNewTab} aria-label="New tab">
            <Plus size={16} />
        </button>
    </div>
</div>

<!-- Tab Context Menu -->
{#if contextMenuTabId}
    <TabContextMenu tabId={contextMenuTabId} x={contextMenuX} y={contextMenuY} onClose={closeContextMenu} />
{/if}

<!-- MRU Tabs Popup -->
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
        -webkit-user-drag: none;
    }

    .tab-button {
        -webkit-app-region: no-drag;
        user-select: none;
    }

    .tab-button[draggable="true"] {
        cursor: default;
    }

    .tab-button[draggable="true"]:active {
        cursor: grabbing;
    }

    .tab-button .truncate {
        pointer-events: none;
    }

    /* Search input styling */
    input::placeholder {
        color: var(--fg-muted);
        opacity: 0.5;
    }
</style>
