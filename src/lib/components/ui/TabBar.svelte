<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { ChevronDown, Plus } from "lucide-svelte";
    import { onMount, tick } from "svelte";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";
    import TabDropdown from "./TabDropdown.svelte";

    let scrollContainer = $state<HTMLElement>();
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());

    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    let showMruPopup = $state(false);
    let mruSelectedIndex = $state(0);
    let isMruCycling = $state(false);
    let mruPopupTimeout: number | null = null;
    let mruCleanupTimeout: number | null = null;

    let isDragging = $state(false);
    let showLeftFade = $state(false);
    let showRightFade = $state(false);

    function updateFadeIndicators() {
        if (!scrollContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
        showLeftFade = scrollLeft > 5;
        showRightFade = scrollLeft < scrollWidth - clientWidth - 5;
    }

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
                if (!isMruCycling) {
                    isMruCycling = true;
                    // Start cycling from the next item in the stack (previously active)
                    mruSelectedIndex = editorStore.mruStack.length > 1 ? 1 : 0;

                    if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
                    mruPopupTimeout = window.setTimeout(() => {
                        if (isMruCycling) showMruPopup = true;
                    }, 200);
                } else {
                    // Cycle through the entire stack
                    mruSelectedIndex = (mruSelectedIndex + 1) % editorStore.mruStack.length;
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && isMruCycling) {
                const stack = editorStore.mruStack;
                if (stack.length > 0) {
                    const safeIndex = Math.min(Math.max(0, mruSelectedIndex), stack.length - 1);
                    const targetId = stack[safeIndex];

                    if (targetId && targetId !== appState.activeTabId) {
                        appState.activeTabId = targetId;
                        editorStore.pushToMru(targetId);
                    }
                }

                isMruCycling = false;
                if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
                if (mruCleanupTimeout) clearTimeout(mruCleanupTimeout);
                mruCleanupTimeout = window.setTimeout(() => {
                    showMruPopup = false;
                    mruSelectedIndex = 0;
                }, 50);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        scrollContainer?.addEventListener("scroll", updateFadeIndicators);
        updateFadeIndicators();

        return () => {
            if (unlisten) unlisten();
            clearInterval(interval);
            if (mruPopupTimeout) clearTimeout(mruPopupTimeout);
            if (mruCleanupTimeout) clearTimeout(mruCleanupTimeout);
            scrollContainer?.removeEventListener("scroll", updateFadeIndicators);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    });

    async function scrollToActive() {
        await tick();
        setTimeout(() => {
            if (!scrollContainer) return;
            const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
            if (!activeEl) return;

            const containerRect = scrollContainer.getBoundingClientRect();
            const tabRect = activeEl.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const currentScroll = scrollContainer.scrollLeft;

            const tabLeft = tabRect.left - containerRect.left + currentScroll;
            const tabRight = tabRect.right - containerRect.left + currentScroll;

            const nextEl = activeEl.nextElementSibling as HTMLElement;
            const prevEl = activeEl.previousElementSibling as HTMLElement;
            const hasNext = nextEl && nextEl.hasAttribute("data-tab-id");
            const hasPrev = prevEl && prevEl.hasAttribute("data-tab-id");

            const MARGIN = 40;

            let targetScroll = currentScroll;
            let needsScroll = false;

            const effectiveWindowLeft = currentScroll + (hasPrev ? MARGIN : MARGIN);
            const effectiveWindowRight = currentScroll + containerWidth - (hasNext ? MARGIN : MARGIN);

            if (tabLeft < effectiveWindowLeft) {
                targetScroll = tabLeft - MARGIN;
                needsScroll = true;
            } else if (tabRight > effectiveWindowRight) {
                targetScroll = tabRight - containerWidth + MARGIN;
                needsScroll = true;
            }

            const maxPossibleScroll = scrollContainer.scrollWidth - containerWidth;
            targetScroll = Math.max(0, Math.min(targetScroll, maxPossibleScroll));

            if (needsScroll && Math.abs(currentScroll - targetScroll) > 2) {
                scrollContainer.scrollTo({ left: targetScroll, behavior: "smooth" });
            }

            setTimeout(updateFadeIndicators, 150);
        }, 50);
    }

    $effect(() => {
        if (appState.activeTabId) scrollToActive();
    });

    $effect(() => {
        editorStore.tabs.length;
        setTimeout(updateFadeIndicators, 100);
    });

    function handleTabClick(id: string) {
        appState.activeTabId = id;
        editorStore.pushToMru(id);
    }

    function handleNewTab() {
        const newId = editorStore.addTab();
        appState.activeTabId = newId;
        setTimeout(() => scrollToActive(), 100);
    }

    function handleCloseTab(e: MouseEvent, tabId: string) {
        const tab = editorStore.tabs.find((t) => t.id === tabId);
        if (tab?.isPinned) return;
        requestCloseTab(tabId);
    }

    function handleTabContextMenu(e: MouseEvent, tabId: string) {
        e.preventDefault();
        e.stopPropagation();
        contextMenuTabId = tabId;
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
    }

    function handleDropdownSelect(id: string) {
        handleTabClick(id);
        showDropdown = false;
    }

    function handleMruSelect(tabId: string) {
        appState.activeTabId = tabId;
        editorStore.pushToMru(tabId);
    }

    function handleDndConsider(e: CustomEvent<DndEvent<EditorTab>>) {
        editorStore.tabs = e.detail.items;
        isDragging = true;
    }

    function handleDndFinalize(e: CustomEvent<DndEvent<EditorTab>>) {
        editorStore.tabs = e.detail.items;
        editorStore.sessionDirty = true;
        isDragging = false;
    }
</script>

{#if isDragging}
    <style>
        body * {
            cursor: grabbing !important;
        }
    </style>
{/if}

<div class="h-9 flex items-end w-full border-b relative shrink-0 tab-bar-container" style="background-color: var(--bg-panel); border-color: var(--border-main);">
    <div class="relative h-8 border-r border-[var(--border-main)]">
        <button class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--fg-muted)] text-xs" onclick={() => (showDropdown = !showDropdown)}>
            <span>{editorStore.tabs.length}</span>
            <ChevronDown size={12} />
        </button>
        <TabDropdown isOpen={showDropdown} onSelect={handleDropdownSelect} onClose={() => (showDropdown = false)} />
    </div>

    <section
        bind:this={scrollContainer}
        class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full tab-scroll-container relative"
        use:dndzone={{
            items: editorStore.tabs,
            type: "tabs",
            flipDurationMs: 200,
            dropTargetStyle: {},
        }}
        onconsider={handleDndConsider}
        onfinalize={handleDndFinalize}
    >
        {#if showLeftFade}
            <div class="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10" style="background: linear-gradient(to right, var(--bg-panel), transparent);"></div>
        {/if}

        {#if showRightFade}
            <div class="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10" style="background: linear-gradient(to left, var(--bg-panel), transparent);"></div>
        {/if}

        {#each editorStore.tabs as tab (tab.id)}
            <div class="h-full flex items-end" animate:flip={{ duration: 200 }}>
                <TabButton {tab} isActive={appState.activeTabId === tab.id} {currentTime} onclick={handleTabClick} onclose={handleCloseTab} oncontextmenu={handleTabContextMenu} />
            </div>
        {/each}
    </section>

    <div class="h-full flex items-end border-l border-[var(--border-main)]">
        <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--fg-muted)] shrink-0" onclick={handleNewTab}>
            <Plus size={16} />
        </button>
    </div>
</div>

{#if contextMenuTabId}
    <TabContextMenu tabId={contextMenuTabId} x={contextMenuX} y={contextMenuY} onClose={() => (contextMenuTabId = null)} />
{/if}

<MruTabsPopup isOpen={showMruPopup} onClose={() => (showMruPopup = false)} onSelect={handleMruSelect} selectedId={isMruCycling ? editorStore.mruStack[mruSelectedIndex] : appState.activeTabId} />

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
        pointer-events: auto;
    }
</style>
