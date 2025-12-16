<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { ChevronDown, Plus } from "lucide-svelte";
    import { onMount, tick } from "svelte";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";
    import TabDropdown from "./TabDropdown.svelte";

    let scrollContainer: HTMLDivElement;
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());

    let draggedTabId: string | null = $state(null);
    let draggedOverTabId: string | null = $state(null);
    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

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
    }

    function handleDropdownSelect(id: string) {
        handleTabClick(id);
        showDropdown = false;
    }

    function handleMruSelect(tabId: string) {
        appState.activeTabId = tabId;
        editorStore.pushToMru(tabId);
    }

    let tabCount = $derived(editorStore.tabs.length);

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
        <TabDropdown isOpen={showDropdown} onSelect={handleDropdownSelect} onClose={toggleDropdown} />
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
</style>
