<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { ChevronDown, Plus } from "lucide-svelte";
    import { onMount, tick, untrack } from "svelte";
    import { flip } from "svelte/animate";
    import { fade } from "svelte/transition";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";
    import TabDropdown from "./TabDropdown.svelte";

    // --- DIAGNOSTICS ---
    function log(action: string, details?: any) {
        // console.log(`[TabBar] ${action}`, details || "");
    }

    let scrollContainer = $state<HTMLElement>();
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());

    // --- Local State ---
    let localTabs = $state<any[]>([]);

    // Pointer Drag State
    let isDragging = $state(false);
    let draggingId = $state<string | null>(null);
    let dragStartX = 0;
    let rafId: number | null = null;

    // Layout Snapshot
    let layoutCache: { center: number }[] = [];

    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    let showMruPopup = $state(false);
    let mruSelectedIndex = $state(0);
    let isMruCycling = $state(false);
    let mruTimer: number | null = null;

    // --- Store Sync ---
    $effect(() => {
        const storeTabs = editorStore.tabs;
        untrack(() => {
            if (!draggingId) {
                const needsUpdate = localTabs.length !== storeTabs.length || !localTabs.every((t, i) => t === storeTabs[i]);

                if (needsUpdate) {
                    log("Syncing Store -> Local");
                    localTabs = [...storeTabs];
                    tick().then(updateFadeIndicators);
                }
            }
        });
    });

    onMount(() => {
        localTabs = [...editorStore.tabs];

        const interval = setInterval(() => (currentTime = Date.now()), 60000);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();

                if (!isMruCycling) {
                    // Start Cycling
                    isMruCycling = true;
                    // Start at previous tab (index 1) if available
                    mruSelectedIndex = editorStore.mruStack.length > 1 ? 1 : 0;

                    // Delay showing popup for quick switch
                    if (mruTimer) clearTimeout(mruTimer);
                    mruTimer = window.setTimeout(() => {
                        showMruPopup = true;
                    }, 200);
                } else {
                    // Cycle to next
                    mruSelectedIndex = (mruSelectedIndex + 1) % editorStore.mruStack.length;
                    // If user presses tab again, show popup immediately
                    showMruPopup = true;
                    if (mruTimer) clearTimeout(mruTimer);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Control" || !e.ctrlKey) {
                if (isMruCycling) {
                    // Commit switch
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

        const resizeObserver = new ResizeObserver(() => {
            updateFadeIndicators();
        });

        if (scrollContainer) {
            scrollContainer.addEventListener("scroll", updateFadeIndicators);
            resizeObserver.observe(scrollContainer);
        }

        updateFadeIndicators();

        return () => {
            clearInterval(interval);
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            if (scrollContainer) {
                scrollContainer.removeEventListener("scroll", updateFadeIndicators);
            }
            resizeObserver.disconnect();
        };
    });

    // --- Pointer Event Logic ---

    function handlePointerDown(e: PointerEvent, id: string) {
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        if (target.closest(".close-btn-wrapper") || target.closest("button")) {
            return;
        }

        e.preventDefault();

        const wrapper = e.currentTarget as HTMLElement;
        wrapper.setPointerCapture(e.pointerId);

        draggingId = id;
        isDragging = false;
        dragStartX = e.clientX;

        if (scrollContainer) {
            layoutCache = Array.from(scrollContainer.children)
                .filter((el) => el.getAttribute("role") === "listitem")
                .map((el) => {
                    const rect = el.getBoundingClientRect();
                    return { center: rect.left + rect.width / 2 };
                });
        }
    }

    function handlePointerMove(e: PointerEvent) {
        if (!draggingId) return;
        e.preventDefault();

        if (!isDragging) {
            if (Math.abs(e.clientX - dragStartX) > 5) {
                isDragging = true;
            } else {
                return;
            }
        }

        if (rafId) return;

        rafId = requestAnimationFrame(() => {
            rafId = null;

            const mouseX = e.clientX;
            let targetIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < layoutCache.length; i++) {
                const center = layoutCache[i].center;
                const dist = Math.abs(mouseX - center);
                if (dist < minDistance) {
                    minDistance = dist;
                    targetIndex = i;
                }
            }

            const currentIndex = localTabs.findIndex((t) => t.id === draggingId);
            if (currentIndex === -1) return;

            if (targetIndex !== currentIndex) {
                const newTabs = [...localTabs];
                const [item] = newTabs.splice(currentIndex, 1);
                newTabs.splice(targetIndex, 0, item);
                localTabs = newTabs;
            }
        });
    }

    function handlePointerUp(e: PointerEvent, id: string) {
        if (!draggingId) return;

        const wrapper = e.currentTarget as HTMLElement;
        wrapper.releasePointerCapture(e.pointerId);

        if (!isDragging) {
            appState.activeTabId = id;
            editorStore.pushToMru(id);
        } else {
            editorStore.tabs = [...localTabs];
            editorStore.sessionDirty = true;
        }

        isDragging = false;
        draggingId = null;
        layoutCache = [];

        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        tick().then(updateFadeIndicators);
    }

    // --- UI Helpers ---

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

        const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
        if (!activeEl) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const tabRect = activeEl.getBoundingClientRect();
        const PEEK_AMOUNT = 80;

        if (tabRect.right > containerRect.right - PEEK_AMOUNT) {
            const offsetRight = activeEl.offsetLeft + activeEl.offsetWidth;
            const targetScroll = offsetRight - scrollContainer.clientWidth + PEEK_AMOUNT;
            scrollContainer.scrollTo({ left: targetScroll, behavior: "smooth" });
        } else if (tabRect.left < containerRect.left + PEEK_AMOUNT) {
            const targetScroll = activeEl.offsetLeft - PEEK_AMOUNT;
            scrollContainer.scrollTo({ left: targetScroll, behavior: "smooth" });
        }
    }

    $effect(() => {
        if (appState.activeTabId) scrollToActive();
    });
</script>

<div class="h-9 flex items-end w-full border-b relative shrink-0" style="background-color: var(--color-bg-panel); border-color: var(--color-border-main);">
    <!-- Dropdown -->
    <div class="relative h-8 border-r border-[var(--color-border-main)]">
        <button type="button" class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--color-fg-muted)] text-xs" onclick={() => (showDropdown = !showDropdown)} aria-label="Tab Menu">
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

    <!-- Scrollable Tab Area Wrapper -->
    <div class="flex-1 h-full relative min-w-0">
        {#if showLeftFade}
            <div class="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-20" transition:fade={{ duration: 150 }} style="background: linear-gradient(to right, var(--color-bg-panel), transparent);"></div>
        {/if}

        <section bind:this={scrollContainer} class="w-full h-full flex items-end overflow-x-auto no-scrollbar tab-scroll-container" onscroll={updateFadeIndicators}>
            {#each localTabs as tab (tab.id)}
                <div class="h-full flex items-end shrink-0 outline-none select-none touch-none" animate:flip={{ duration: draggingId === tab.id ? 0 : 250 }} role="listitem" style="opacity: {isDragging && draggingId === tab.id ? '0.8' : '1'}; z-index: {isDragging && draggingId === tab.id ? 100 : 0}; cursor: {isDragging && draggingId === tab.id ? 'grabbing' : 'default'};" onpointerdown={(e) => handlePointerDown(e, tab.id)} onpointermove={handlePointerMove} onpointerup={(e) => handlePointerUp(e, tab.id)} onpointercancel={(e) => handlePointerUp(e, tab.id)}>
                    <TabButton
                        {tab}
                        isActive={appState.activeTabId === tab.id}
                        {currentTime}
                        onclick={() => {}}
                        onclose={(e, id) => requestCloseTab(id)}
                        oncontextmenu={(e, id) => {
                            contextMenuTabId = id;
                            contextMenuX = e.clientX;
                            contextMenuY = e.clientY;
                        }}
                    />
                </div>
            {/each}

            <!-- Padding at end -->
            <div class="w-4 h-full shrink-0"></div>
        </section>

        {#if showRightFade}
            <div class="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-20" transition:fade={{ duration: 150 }} style="background: linear-gradient(to left, var(--color-bg-panel), transparent);"></div>
        {/if}
    </div>

    <!-- New Tab -->
    <div class="h-full flex items-end border-l border-[var(--color-border-main)]">
        <button type="button" class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--color-fg-muted)] shrink-0" onclick={() => editorStore.addTab()} aria-label="New Tab">
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
