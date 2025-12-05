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
            // Force reactivity for time-based colors every minute
            editorStore.tabs = [...editorStore.tabs];
        }, 60000);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                if (!showMruPopup) {
                    showMruPopup = true;
                    tabKeyHeld = true;
                } else {
                    cycleNextMru();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && tabKeyHeld) {
                tabKeyHeld = false;
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
        const currentActive = appState.activeTabId;
        const currentIndex = editorStore.mruStack.findIndex((id) => id === currentActive);
        const nextIndex = (currentIndex + 1) % editorStore.mruStack.length;
        const nextTabId = editorStore.mruStack[nextIndex];
        if (nextTabId) {
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
            const activeEl = scrollContainer.querySelector('[data-active="true"]');
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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

<div class="h-9 flex items-end w-full border-b relative shrink-0" style="background-color: var(--bg-panel); border-color: var(--border-main);">
    {#if showLeftArrow}
        <button class="h-8 w-6 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] z-10 bg-[var(--bg-panel)] border-r border-[var(--border-main)]" onclick={() => scroll("left")} aria-label="Scroll tabs left">
            <ChevronLeft size={14} />
        </button>
    {/if}

    <div bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full" onscroll={() => scheduleCheckScroll()}>
        {#each editorStore.tabs as tab (tab.id)}
            {@const isActive = appState.activeTabId === tab.id}
            {@const iconColor = getIconColor(tab, isActive)}

            <button
                type="button"
                data-active={isActive}
                class="group relative h-8 px-2 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden"
                style="
                    background-color: {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'};
                    color: {isActive ? 'var(--fg-default)' : 'var(--fg-muted)'};
                    border-color: var(--border-main);
                    border-top: 2px solid {isActive ? 'var(--accent-secondary)' : 'transparent'};
                    min-width: {appState.tabWidthMin}px;
                    max-width: {appState.tabWidthMax}px;
                "
                onclick={() => handleTabClick(tab.id)}
                oncontextmenu={(e) => handleTabContextMenu(e, tab.id)}
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
                    <Pin size={12} class="flex-shrink-0" style="color: {isActive ? 'var(--accent-secondary)' : 'var(--fg-muted)'}" />
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
<MruTabsPopup isOpen={showMruPopup} onClose={() => (showMruPopup = false)} onSelect={handleMruSelect} />

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
