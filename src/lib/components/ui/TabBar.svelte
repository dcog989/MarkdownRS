<script lang="ts">
    import { SortableController } from "$lib/actions/sortable.svelte.ts";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore, type EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { ChevronDown, Plus } from "lucide-svelte";
    import { onDestroy, onMount, tick } from "svelte";
    import { flip } from "svelte/animate";
    import { fade } from "svelte/transition";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";
    import TabDropdown from "./TabDropdown.svelte";

    let scrollContainer = $state<HTMLElement>();
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());

    // Drag State
    let isDragging = $state(false);
    let draggingId = $state<string | null>(null);
    let dragOffsetX = $state(0);
    let currentDragX = $state(0);

    // Context Menu & MRU State
    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let showMruPopup = $state(false);
    let mruSelectedIndex = $state(0);
    let isMruCycling = $state(false);
    let mruTimer: number | null = null;

    const sortController = new SortableController<EditorTab>({
        items: [], // Will be updated by effect
        idKey: "id",
        container: undefined,
        onSort: (newItems) => {
            editorStore.reorderTabs(newItems);
        },
        onDragStart: (id, x, offset) => {
            draggingId = id;
            isDragging = false; // Will set to true on move
            dragOffsetX = offset;
        },
        onDragMove: (x) => {
            isDragging = true;
            currentDragX = x;
        },
        onDragEnd: () => {
            if (isDragging) {
                editorStore.sessionDirty = true;
            } else if (draggingId) {
                appState.activeTabId = draggingId;
                editorStore.pushToMru(draggingId);
            }
            isDragging = false;
            draggingId = null;
            tick().then(updateFadeIndicators);
        },
    });

    // Reactive update for controller options
    $effect(() => {
        sortController.updateOptions({
            items: editorStore.tabs,
            container: scrollContainer,
        });
    });

    // Reactively update fade indicators when tab count changes
    $effect(() => {
        const _ = editorStore.tabs.length;
        tick().then(updateFadeIndicators);
    });

    onMount(() => {
        const interval = setInterval(() => (currentTime = Date.now()), 60000);

        // Listen for forced scroll events
        const handleScrollToActive = () => scrollToActive();
        window.addEventListener("scroll-to-active-tab", handleScrollToActive);

        // MRU & Keyboard logic
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                if (!isMruCycling) {
                    isMruCycling = true;
                    mruSelectedIndex = editorStore.mruStack.length > 1 ? 1 : 0;
                    if (mruTimer) clearTimeout(mruTimer);
                    mruTimer = window.setTimeout(() => (showMruPopup = true), 200);
                } else {
                    mruSelectedIndex = (mruSelectedIndex + 1) % editorStore.mruStack.length;
                    showMruPopup = true;
                    if (mruTimer) clearTimeout(mruTimer);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Control" || !e.ctrlKey) {
                if (isMruCycling) {
                    if (mruTimer) clearTimeout(mruTimer);
                    const targetId = editorStore.mruStack[mruSelectedIndex];
                    if (targetId) {
                        appState.activeTabId = targetId;
                        editorStore.pushToMru(targetId);
                    }
                    isMruCycling = false;
                    showMruPopup = false;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            clearInterval(interval);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("scroll-to-active-tab", handleScrollToActive);
        };
    });

    onDestroy(() => {
        sortController.destroy();
    });

    // Fade Indicators
    let showLeftFade = $state(false);
    let showRightFade = $state(false);

    function updateFadeIndicators() {
        if (!scrollContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
        showLeftFade = scrollLeft > 5;
        showRightFade = scrollLeft < scrollWidth - clientWidth - 2;
    }

    async function scrollToActive() {
        await tick();
        if (!scrollContainer || isDragging) return;

        // Wait a bit more for the flip animation to complete
        await new Promise((resolve) => setTimeout(resolve, 300));

        const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
        if (!activeEl) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const tabRect = activeEl.getBoundingClientRect();
        const PEEK_AMOUNT = 55;

        if (tabRect.right > containerRect.right - PEEK_AMOUNT) {
            scrollContainer.scrollTo({ left: activeEl.offsetLeft + activeEl.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT, behavior: "smooth" });
        } else if (tabRect.left < containerRect.left + PEEK_AMOUNT) {
            scrollContainer.scrollTo({ left: activeEl.offsetLeft - PEEK_AMOUNT, behavior: "smooth" });
        }
    }

    $effect(() => {
        if (appState.activeTabId) scrollToActive();
    });
</script>

<div class="h-9 flex items-end w-full border-b relative shrink-0 bg-bg-panel border-border-main">
    <div class="relative h-8 border-r border-border-main">
        <button type="button" class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-fg-muted text-xs" onclick={() => (showDropdown = !showDropdown)}>
            <span>{editorStore.tabs.length}</span>
            <ChevronDown size={12} />
        </button>
        <TabDropdown
            isOpen={showDropdown}
            onSelect={(id) => {
                appState.activeTabId = id;
                editorStore.pushToMru(id);
                showDropdown = false;
            }}
            onClose={() => (showDropdown = false)}
        />
    </div>

    <div class="flex-1 h-full relative min-w-0">
        {#if showLeftFade}
            <div class="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-20" transition:fade={{ duration: 150 }} style="background: linear-gradient(to right, var(--color-bg-panel), transparent);"></div>
        {/if}

        <section bind:this={scrollContainer} class="w-full h-full flex items-end overflow-x-auto no-scrollbar tab-scroll-container" onscroll={updateFadeIndicators}>
            {#each editorStore.tabs as tab (tab.id)}
                <div class="h-full flex items-end shrink-0 outline-none select-none touch-none" animate:flip={{ duration: draggingId === tab.id ? 0 : 250 }} role="listitem" style="opacity: {isDragging && draggingId === tab.id ? '0.4' : '1'}; z-index: {isDragging && draggingId === tab.id ? 100 : 0};" onpointerdown={(e) => sortController.startDrag(e, tab.id, e.currentTarget as HTMLElement)}>
                    <TabButton
                        {tab}
                        isActive={appState.activeTabId === tab.id}
                        {currentTime}
                        onclose={(_, id) => requestCloseTab(id)}
                        oncontextmenu={(e, id) => {
                            contextMenuTabId = id;
                            contextMenuX = e.clientX;
                            contextMenuY = e.clientY;
                        }}
                    />
                </div>
            {/each}

            {#if isDragging && draggingId}
                {@const dragTab = editorStore.tabs.find((t) => t.id === draggingId)}
                {#if dragTab}
                    <div class="fixed pointer-events-none z-[999]" style="left: {currentDragX - dragOffsetX}px; top: {scrollContainer?.getBoundingClientRect().top ?? 0}px; opacity: 0.95;">
                        <TabButton tab={dragTab} isActive={appState.activeTabId === dragTab.id} {currentTime} />
                    </div>
                {/if}
            {/if}
            <div class="w-4 h-full shrink-0"></div>
        </section>

        {#if showRightFade}
            <div class="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-20" transition:fade={{ duration: 150 }} style="background: linear-gradient(to left, var(--color-bg-panel), transparent);"></div>
        {/if}
    </div>

    <div class="h-full flex items-end border-l border-border-main">
        <button type="button" class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-fg-muted shrink-0" onclick={() => editorStore.addTab()}>
            <Plus size={16} />
        </button>
    </div>
</div>

{#if contextMenuTabId}
    <TabContextMenu tabId={contextMenuTabId} x={contextMenuX} y={contextMenuY} onClose={() => (contextMenuTabId = null)} />
{/if}

<MruTabsPopup
    isOpen={showMruPopup}
    onClose={() => (showMruPopup = false)}
    onSelect={(id) => {
        appState.activeTabId = id;
        editorStore.pushToMru(id);
    }}
    selectedId={isMruCycling ? editorStore.mruStack[mruSelectedIndex] : appState.activeTabId}
/>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .tab-scroll-container {
        pointer-events: auto;
    }
</style>
