<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { ChevronDown, Plus } from "lucide-svelte";
    import { onMount, tick, untrack } from "svelte";
    import { flip } from "svelte/animate";
    import MruTabsPopup from "./MruTabsPopup.svelte";
    import TabButton from "./TabButton.svelte";
    import TabContextMenu from "./TabContextMenu.svelte";
    import TabDropdown from "./TabDropdown.svelte";

    // --- DIAGNOSTICS ---
    function log(action: string, details?: any) {
        console.log(`[TabBar] ${action}`, details || "");
    }

    let scrollContainer = $state<HTMLElement>();
    let showDropdown = $state(false);
    let currentTime = $state(Date.now());

    // --- Local State ---
    let localTabs = $state<any[]>([]);

    // Pointer Drag State
    let isDragging = $state(false); // True only after moving threshold
    let draggingId = $state<string | null>(null);
    let dragStartX = 0;

    let contextMenuTabId: string | null = $state(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    let showMruPopup = $state(false);
    let mruSelectedIndex = $state(0);
    let isMruCycling = $state(false);

    // --- Store Sync ---
    // Only sync when we are NOT interacting to prevent UI jumps during drag
    $effect(() => {
        const storeTabs = editorStore.tabs;
        untrack(() => {
            if (!draggingId) {
                const currentIds = localTabs.map((t) => t.id).join(",");
                const newIds = storeTabs.map((t) => t.id).join(",");

                if (currentIds !== newIds) {
                    log("Syncing Store -> Local", newIds);
                    localTabs = [...storeTabs];
                    tick().then(updateFadeIndicators);
                }
            }
        });
    });

    onMount(() => {
        // Init local tabs
        localTabs = [...editorStore.tabs];

        const interval = setInterval(() => (currentTime = Date.now()), 60000);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                if (!isMruCycling) {
                    isMruCycling = true;
                    mruSelectedIndex = editorStore.mruStack.length > 1 ? 1 : 0;
                    showMruPopup = true;
                } else {
                    mruSelectedIndex = (mruSelectedIndex + 1) % editorStore.mruStack.length;
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && isMruCycling) {
                const targetId = editorStore.mruStack[mruSelectedIndex];
                if (targetId) {
                    appState.activeTabId = targetId;
                    editorStore.pushToMru(targetId);
                }
                isMruCycling = false;
                showMruPopup = false;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        scrollContainer?.addEventListener("scroll", updateFadeIndicators);
        updateFadeIndicators();

        return () => {
            clearInterval(interval);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            scrollContainer?.removeEventListener("scroll", updateFadeIndicators);
        };
    });

    // --- Pointer Event Logic (Custom DND) ---

    function handlePointerDown(e: PointerEvent, id: string) {
        // Only Left Click
        if (e.button !== 0) return;

        const target = e.target as HTMLElement;
        // Ignore if clicking close button or existing interactive elements
        // (The close button wrapper usually has a specific class or we check for button tags)
        if (target.closest(".close-btn-wrapper") || target.closest("button")) {
            return;
        }

        e.preventDefault(); // Prevent text selection/native drag

        const wrapper = e.currentTarget as HTMLElement;
        wrapper.setPointerCapture(e.pointerId);

        draggingId = id;
        isDragging = false; // Wait for move to confirm drag
        dragStartX = e.clientX;

        log("Pointer Down", { id });
    }

    function handlePointerMove(e: PointerEvent) {
        if (!draggingId) return;
        e.preventDefault();

        // Threshold check: Treat as click if movement is small
        if (!isDragging) {
            if (Math.abs(e.clientX - dragStartX) > 5) {
                isDragging = true;
                log("Drag Started (Threshold Passed)");
            } else {
                return;
            }
        }

        if (!scrollContainer) return;

        // 1. Identify current index
        const currentIndex = localTabs.findIndex((t) => t.id === draggingId);
        if (currentIndex === -1) return;

        // 2. Find target based on mouse X
        const mouseX = e.clientX;
        const children = Array.from(scrollContainer.children).filter((el) => el.getAttribute("role") === "listitem");

        let targetIndex = currentIndex;
        let minDistance = Infinity;

        for (let i = 0; i < children.length; i++) {
            const rect = children[i].getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const dist = Math.abs(mouseX - centerX);

            if (dist < minDistance) {
                minDistance = dist;
                targetIndex = i;
            }
        }

        // 3. Swap
        if (targetIndex !== currentIndex) {
            log(`Swapping ${currentIndex} -> ${targetIndex}`);
            const newTabs = [...localTabs];
            const [item] = newTabs.splice(currentIndex, 1);
            newTabs.splice(targetIndex, 0, item);
            localTabs = newTabs;
        }
    }

    function handlePointerUp(e: PointerEvent, id: string) {
        if (!draggingId) return;

        const wrapper = e.currentTarget as HTMLElement;
        wrapper.releasePointerCapture(e.pointerId);

        if (!isDragging) {
            log("Click Detected - Selecting Tab");
            appState.activeTabId = id;
            editorStore.pushToMru(id);
        } else {
            log("Drag Ended - Committing");
            editorStore.tabs = [...localTabs];
            editorStore.sessionDirty = true;
        }

        // Reset
        isDragging = false;
        draggingId = null;

        tick().then(updateFadeIndicators);
    }

    // --- UI Helpers ---

    let showLeftFade = $state(false);
    let showRightFade = $state(false);

    function updateFadeIndicators() {
        if (!scrollContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
        showLeftFade = scrollLeft > 5;
        showRightFade = scrollLeft < scrollWidth - clientWidth - 5;
    }

    async function scrollToActive() {
        await tick();
        if (!scrollContainer || isDragging) return;
        const activeEl = scrollContainer.querySelector('[data-active="true"]') as HTMLElement;
        if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
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

    <!-- Scrollable Tab Container -->
    <section bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar h-full tab-scroll-container relative" onscroll={updateFadeIndicators}>
        {#if showLeftFade}
            <div class="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10" style="background: linear-gradient(to right, var(--color-bg-panel), transparent);"></div>
        {/if}
        {#if showRightFade}
            <div class="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10" style="background: linear-gradient(to left, var(--color-bg-panel), transparent);"></div>
        {/if}

        {#each localTabs as tab (tab.id)}
            <div class="h-full flex items-end shrink-0 outline-none select-none touch-none" animate:flip={{ duration: 150 }} role="listitem" style="opacity: {isDragging && draggingId === tab.id ? '0.6' : '1'}; cursor: {isDragging && draggingId === tab.id ? 'grabbing' : 'default'};" onpointerdown={(e) => handlePointerDown(e, tab.id)} onpointermove={handlePointerMove} onpointerup={(e) => handlePointerUp(e, tab.id)} onpointercancel={(e) => handlePointerUp(e, tab.id)}>
                <TabButton
                    {tab}
                    isActive={appState.activeTabId === tab.id}
                    {currentTime}
                    onclick={() => {
                        /* Handled by pointer events now */
                    }}
                    onclose={(e, id) => {
                        // Close still works via TabButton's internal click handler
                        requestCloseTab(id);
                    }}
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
