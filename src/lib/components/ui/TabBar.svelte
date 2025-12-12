<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { ChevronDown, ChevronLeft, ChevronRight, File, FileText, Pencil, Pin, Plus, X } from "lucide-svelte";
    import { onMount, tick } from "svelte";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";

    let scrollContainer: HTMLDivElement;
    let showLeftArrow = $state(false);
    let showRightArrow = $state(false);
    let showDropdown = $state(false);
    let checkScrollTimeout: number | null = null;
    
    // Drag and drop state
    let draggedTabId: string | null = $state(null);
    let draggedOverTabId: string | null = $state(null);

    // Context menu state
    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    // MRU popup state
    let showMruPopup = $state(false);
    let mruTimeout: number | null = null;
    let tabKeyHeld = $state(false);

    onMount(() => {
        const appWindow = getCurrentWindow();
        let unlisten: (() => void) | undefined;

        appWindow.onResized(() => scheduleCheckScroll()).then((u) => (unlisten = u));

        const interval = setInterval(() => {
            scheduleCheckScroll();
            editorStore.tabs = [...editorStore.tabs]; // Force reactivity
        }, 60000);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                
                if (!tabKeyHeld) {
                    // First Ctrl+Tab: just switch to last used tab, DON'T show popup yet
                    tabKeyHeld = true;
                    
                    // Switch to MRU index 1 (last used tab)
                    if (editorStore.mruStack.length >= 2) {
                        const lastUsedTab = editorStore.mruStack[1];
                        if (lastUsedTab) {
                            appState.activeTabId = lastUsedTab;
                        }
                    }
                } else if (tabKeyHeld && !showMruPopup) {
                    // Second Ctrl+Tab while still holding Ctrl: NOW show popup and cycle
                    showMruPopup = true;
                    cycleNextMru();
                } else {
                    // Already in MRU mode: continue cycling
                    cycleNextMru();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && tabKeyHeld) {
                tabKeyHeld = false;
                // When Ctrl is released, commit the selection to MRU
                if (appState.activeTabId) {
                    editorStore.pushToMru(appState.activeTabId);
                }
                if (mruTimeout) clearTimeout(mruTimeout);
                mruTimeout = window.setTimeout(() => {
                    showMruPopup = false;
                }, 150);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            if (unlisten) unlisten();
            clearInterval(interval);
            if (checkScrollTimeout) clearTimeout(checkScrollTimeout);
            if (mruTimeout) clearTimeout(mruTimeout);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    });

    function cycleNextMru() {
        // MRU stack is ordered: [most recent, previous, ...]
        // When cycling, skip the current (index 0) and go to next in stack
        if (editorStore.mruStack.length < 2) return;
        
        const currentActive = appState.activeTabId;
        const currentIndex = editorStore.mruStack.findIndex((id) => id === currentActive);
        
        // If we're at the start, go to second item (last used)
        // Otherwise, cycle through the stack
        const nextIndex = (currentIndex + 1) % editorStore.mruStack.length;
        const nextTabId = editorStore.mruStack[nextIndex];
        
        if (nextTabId && nextTabId !== currentActive) {
            // Update activeTabId but DON'T update MRU stack yet
            // MRU stack will be updated when Ctrl is released
            appState.activeTabId = nextTabId;
        }
    }

    function scheduleCheckScroll() {
        if (checkScrollTimeout) return;
        checkScrollTimeout = window.setTimeout(() => {
            checkScroll();
            checkScrollTimeout = null;
        }, 50);
    }

    function checkScroll() {
        if (scrollContainer) {
            showLeftArrow = scrollContainer.scrollLeft > 0;
            showRightArrow = Math.ceil(scrollContainer.scrollLeft + scrollContainer.clientWidth) < scrollContainer.scrollWidth - 2;
        }
    }

    function scroll(direction: "left" | "right") {
        if (scrollContainer) {
            const amount = 200;
            scrollContainer.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
            setTimeout(() => scheduleCheckScroll(), 350);
        }
    }

    async function scrollToActive() {
        await tick();
        setTimeout(() => {
            if (!scrollContainer) return;
            const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
            if (!activeEl) return;
            
            // Check if tab is already fully visible
            const containerRect = scrollContainer.getBoundingClientRect();
            const tabRect = activeEl.getBoundingClientRect();
            const isFullyVisible = tabRect.left >= containerRect.left && tabRect.right <= containerRect.right;
            
            // Only scroll if tab is not fully visible
            if (!isFullyVisible) {
                // Determine which edge to align to
                const isCloserToLeft = tabRect.left < containerRect.left;
                activeEl.scrollIntoView({ 
                    behavior: "smooth", 
                    block: "nearest", 
                    inline: isCloserToLeft ? "start" : "end"
                });
            }
            scheduleCheckScroll();
        }, 100);
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
        const tab = editorStore.tabs.find((t) => t.id === id);
        if (tab?.isPinned) return;
        requestCloseTab(id);
        setTimeout(() => scheduleCheckScroll(), 50);
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
    }

    function handleMruSelect(tabId: string) {
        appState.activeTabId = tabId;
        editorStore.pushToMru(tabId);
    }

    function handleDragStart(e: DragEvent, tabId: string) {
        if (!e.dataTransfer) return;
        const tab = editorStore.tabs.find(t => t.id === tabId);
        if (tab?.isPinned) {
            e.preventDefault();
            return;
        }
        
        console.log('Drag started:', tabId);
        draggedTabId = tabId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tabId);
        
        // Make the drag image semi-transparent
        const target = e.currentTarget as HTMLElement;
        if (target) {
            target.style.opacity = '0.4';
        }
    }

    function handleDragOver(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        
        draggedOverTabId = tabId;
    }

    function handleDragEnter(e: DragEvent, tabId: string) {
        if (!draggedTabId || draggedTabId === tabId) return;
        e.preventDefault();
        draggedOverTabId = tabId;
    }

    function handleDragLeave(e: DragEvent, tabId: string) {
        // Only clear if we're actually leaving this tab
        const relatedTarget = e.relatedTarget as HTMLElement;
        const currentTarget = e.currentTarget as HTMLElement;
        
        // Check if we're leaving to a child element
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
        
        console.log('Drop on:', targetTabId, 'from:', draggedTabId);
        
        if (!draggedTabId || draggedTabId === targetTabId) {
            draggedTabId = null;
            draggedOverTabId = null;
            return;
        }

        const fromIndex = editorStore.tabs.findIndex(t => t.id === draggedTabId);
        const toIndex = editorStore.tabs.findIndex(t => t.id === targetTabId);

        console.log('Moving tab from index', fromIndex, 'to', toIndex);

        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
            const tabs = [...editorStore.tabs];
            const [movedTab] = tabs.splice(fromIndex, 1);
            tabs.splice(toIndex, 0, movedTab);
            editorStore.tabs = tabs;
            editorStore.sessionDirty = true;
            console.log('Tab reordered successfully');
        }

        draggedTabId = null;
        draggedOverTabId = null;
    }

    function handleDragEnd(e: DragEvent) {
        console.log('Drag ended');
        // Reset visual feedback
        const target = e.currentTarget as HTMLElement;
        if (target) {
            target.style.opacity = '1';
        }
        draggedTabId = null;
        draggedOverTabId = null;
    }

    function getIconColor(tab: EditorTab, isActive: boolean): string {
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
</script>

<div class="h-9 flex items-end w-full border-b relative shrink-0 tab-bar-container" style="background-color: var(--bg-panel); border-color: var(--border-main);">
    {#if showLeftArrow}
        <button class="h-8 w-6 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] z-10 bg-[var(--bg-panel)] border-r border-[var(--border-main)]" onclick={() => scroll("left")} aria-label="Scroll tabs left">
            <ChevronLeft size={14} />
        </button>
    {/if}

    <div bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full tab-scroll-container" onscroll={() => scheduleCheckScroll()}>
        {#each editorStore.tabs as tab (tab.id)}
            {@const isActive = appState.activeTabId === tab.id}
            {@const iconColor = getIconColor(tab, isActive)}

            <button
                type="button"
                data-active={isActive}
                draggable="true"
                class="group relative h-8 pl-2 pr-0 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden"
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
                onclick={() => handleTabClick(tab.id)}
                oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
                ondragstart={(e) => handleDragStart(e, tab.id)}
                ondragover={(e) => handleDragOver(e, tab.id)}
                ondragenter={(e) => handleDragEnter(e, tab.id)}
                ondragleave={(e) => handleDragLeave(e, tab.id)}
                ondrop={(e) => handleDrop(e, tab.id)}
                ondragend={(e) => handleDragEnd(e)}
                aria-label={`${tab.title}${tab.isDirty ? " (modified)" : ""}${tab.isPinned ? " (pinned)" : ""}`}
            >
                <!-- File Type Icon -->
                {#if tab.path && tab.isDirty}
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
            </button>
        {/each}

        <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--fg-muted)] shrink-0" onclick={handleNewTab} aria-label="New tab">
            <Plus size={16} />
        </button>
    </div>

    {#if showRightArrow}
        <button class="h-8 w-6 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] z-10 bg-[var(--bg-panel)] border-l border-[var(--border-main)]" onclick={() => scroll("right")} aria-label="Scroll tabs right">
            <ChevronRight size={14} />
        </button>
    {/if}

    <div class="relative h-8 border-l border-[var(--border-main)]">
        <button class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--fg-muted)] text-xs" onclick={() => (showDropdown = !showDropdown)} aria-label={`${tabCount} tabs open`}>
            <span>{tabCount}</span>
            <ChevronDown size={12} />
        </button>

        {#if showDropdown}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="fixed inset-0 z-40" onclick={() => (showDropdown = false)}></div>
            <div class="absolute right-0 top-full mt-1 w-64 max-h-[300px] overflow-y-auto bg-[#252526] border border-[#333] shadow-xl rounded-b-md z-50 py-1" role="menu">
                {#each editorStore.tabs as tab}
                    <button type="button" class="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/10" style="color: {appState.activeTabId === tab.id ? 'var(--accent-secondary)' : 'var(--fg-muted)'}" onclick={() => handleDropdownSelect(tab.id)} role="menuitem">
                        {#if tab.isPinned}
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
            </div>
        {/if}
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
    
    /* Explicitly allow drag and drop on tabs */
    .tab-bar-container,
    .tab-scroll-container {
        -webkit-app-region: no-drag;
        -webkit-user-drag: none;
    }
    
    button[draggable="true"] {
        -webkit-app-region: no-drag;
        -webkit-user-drag: element;
        cursor: grab;
        user-select: none;
    }
    
    button[draggable="true"]:active {
        cursor: grabbing;
    }
    
    /* Allow pointer events on interactive elements during drag */
    button[draggable="true"] .truncate {
        pointer-events: none;
    }
</style>
