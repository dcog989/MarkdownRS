<script lang="ts">
import { ChevronDown, Menu, Plus } from 'lucide-svelte';
import { onDestroy, onMount, tick } from 'svelte';
import { flip } from 'svelte/animate';
import { fade } from 'svelte/transition';
import { SortableController } from '$lib/actions/sortable.svelte';
import MruTabsPopup from '$lib/components/ui/MruTabsPopup.svelte';
import TabBarContextMenu from '$lib/components/ui/TabBarContextMenu.svelte';
import TabBarMenu from '$lib/components/ui/TabBarMenu.svelte';
import TabButton from '$lib/components/ui/TabButton.svelte';
import TabContextMenu from '$lib/components/ui/TabContextMenu.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { addTab, pushToMru, reorderTabs } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { CONFIG } from '$lib/utils/config';
import { asHTMLElement, assertHTMLElement } from '$lib/utils/dom';
import { persistSessionDebounced, requestCloseTab } from '$lib/utils/fileSystem';
import { createMruCycling } from '$lib/utils/mruCycling.svelte';

let scrollContainer = $state<HTMLElement>();
let showDropdown = $state(false);
let showMenu = $state(false);

let isDragging = $state(false);
let draggingId = $state<string | null>(null);
let dragOffsetX = $state(0);
let currentDragX = $state(0);

let contextMenuTabId: string | null = $state(null);

const PEEK_AMOUNT = 55;
let contextMenuX = $state(0);
let contextMenuY = $state(0);
let showTabBarContextMenu = $state(false);
let tabBarContextMenuX = $state(0);
let tabBarContextMenuY = $state(0);

let mru = createMruCycling();

const sortController = new SortableController<EditorTab>({
    items: [],
    idKey: 'id',
    container: undefined,
    onSort: (newItems) => {
        reorderTabs(newItems);
    },
    onDragStart: (id, _, offset) => {
        draggingId = id;
        isDragging = false;
        dragOffsetX = offset;
    },
    onDragMove: (x) => {
        isDragging = true;
        currentDragX = x;
    },
    onDragEnd: () => {
        if (isDragging) {
            appContext.editor.sessionDirty = true;
            persistSessionDebounced();
        } else if (draggingId) {
            appContext.app.activeTabId = draggingId;
            pushToMru(draggingId);
        }
        isDragging = false;
        draggingId = null;
        tick().then(updateFadeIndicators);
    },
});

$effect(() => {
    sortController.updateOptions({
        items: appContext.editor.tabs,
        container: scrollContainer,
    });
});

$effect(() => {
    void appContext.editor.tabs.length;
    tick().then(updateFadeIndicators);
});

$effect(() => {
    const scrollSignal = appContext.interface.scrollToTabSignal;
    if (scrollSignal > 0) {
        scrollToActive();
    }
});

onMount(() => {
    window.addEventListener('keydown', mru.onKeyDown);
    window.addEventListener('keyup', mru.onKeyUp);

    return () => {
        mru.cleanup();
        window.removeEventListener('keydown', mru.onKeyDown);
        window.removeEventListener('keyup', mru.onKeyUp);
    };
});

onDestroy(() => {
    sortController.destroy();
});

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

    await new Promise((resolve) => setTimeout(resolve, CONFIG.UI_TIMING.TAB_SCROLL_SETTLE_MS));

    const activeEl = scrollContainer.querySelector('[data-active="true"]');
    if (!(activeEl instanceof HTMLElement)) return;
    if (!activeEl) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    if (tabRect.right > containerRect.right - PEEK_AMOUNT) {
        scrollContainer.scrollTo({
            left:
                activeEl.offsetLeft +
                activeEl.offsetWidth -
                scrollContainer.clientWidth +
                PEEK_AMOUNT,
            behavior: 'smooth',
        });
    } else if (tabRect.left < containerRect.left + PEEK_AMOUNT) {
        scrollContainer.scrollTo({
            left: activeEl.offsetLeft - PEEK_AMOUNT,
            behavior: 'smooth',
        });
    }
}

$effect(() => {
    if (appContext.app.activeTabId) scrollToActive();
});
</script>

    <div class="bg-bg-panel relative flex h-9 w-full shrink-0 items-stretch">
    <div class="relative h-9 border-r">
        <button
            type="button"
            class="text-fg-muted hover-surface flex h-full items-center gap-1 px-2 text-xs"
            onclick={() => (showDropdown = !showDropdown)}>
            <span>{appContext.editor.tabs.length}</span>
            <ChevronDown size={12} />
        </button>
        <TabDropdown
            isOpen={showDropdown}
            onSelect={(id) => {
                appContext.app.activeTabId = id;
                pushToMru(id);
                showDropdown = false;
            }}
            onClose={() => (showDropdown = false)} />
    </div>
    <div class="relative h-full min-w-0 flex-1">

    {#if showLeftFade}
            <div
                class="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-12"
                transition:fade={{ duration: 150 }}
                style="background: linear-gradient(to right, var(--surface-2), transparent);"></div>
        {/if}

        <div
            bind:this={scrollContainer}
            role="tablist"
            tabindex="-1"
            class="no-scrollbar tab-scroll-container flex h-full w-full items-stretch overflow-x-auto"
            onscroll={updateFadeIndicators}
            oncontextmenu={(e) => {
                const target = asHTMLElement(e.target);
                if (!target) return;
                if (
                    target.classList.contains("tab-scroll-container") ||
                    target.closest(".tab-scroll-container")
                ) {
                    if (
                        !target.closest('[data-tab-item="true"]') &&
                        !target.closest("button")
                    ) {
                        e.preventDefault();
                        showTabBarContextMenu = true;
                        tabBarContextMenuX = e.clientX;
                        tabBarContextMenuY = e.clientY;
                    }
                }
            }}>
            {#each appContext.editor.tabs as tab (tab.id)}
                <div
                    role="tab"
                    tabindex="-1"
                    class="flex h-full shrink-0 touch-none items-stretch outline-none select-none"
                    data-tab-item="true"
                    animate:flip={{ duration: draggingId === tab.id ? 0 : 250 }}
                    style="opacity: {isDragging && draggingId === tab.id
                        ? '0.4'
                        : '1'}; z-index: {isDragging && draggingId === tab.id
                        ? 100
                        : 0};"
                    onpointerdown={(e) =>
                        sortController.startDrag(
                            e,
                            tab.id,
                            assertHTMLElement(e.currentTarget, "TabBar drag"),
                        )}>
                    <TabButton
                        {tab}
                        isActive={appContext.app.activeTabId === tab.id}
                        onclose={(_, id) => requestCloseTab(id)}
                        oncontextmenu={(e, id) => {
                            contextMenuTabId = id;
                            contextMenuX = e.clientX;
                            contextMenuY = e.clientY;
                        }} />
                </div>
            {/each}

            {#if isDragging && draggingId}
                {@const dragTab = appContext.editor.tabs.find(
                    (t) => t.id === draggingId,
                )}
                {#if dragTab}
                    <div
                        class="pointer-events-none fixed z-999"
                        style="left: {currentDragX -
                            dragOffsetX}px; top: {scrollContainer?.getBoundingClientRect()
                            .top ?? 0}px; opacity: 0.95;">
                        <TabButton
                            tab={dragTab}
                            isActive={appContext.app.activeTabId === dragTab.id} />
                    </div>
                {/if}
            {/if}
        </div>

        {#if showRightFade}
            <div
                class="pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-12"
                transition:fade={{ duration: 150 }}
                style="background: linear-gradient(to left, var(--surface-2), transparent);"></div>
        {/if}
    </div>

    <div class="flex h-full items-stretch border-l pr-2">
        <button
            type="button"
            class="text-fg-muted hover-surface flex h-9 w-9 shrink-0 items-center justify-center"
            onclick={() => {
                const newTabId = addTab();
                appContext.app.activeTabId = newTabId;
            }}>
            <Plus size={16} />
        </button>
        <button
            type="button"
            class="relative text-fg-muted hover-surface flex h-9 w-9 shrink-0 items-center justify-center"
            onclick={() => (showMenu = !showMenu)}>
            <Menu size={16} />
        </button>
        <TabBarMenu bind:showMenu />
    </div>
</div>

{#if contextMenuTabId}
    <TabContextMenu
        tabId={contextMenuTabId}
        x={contextMenuX}
        y={contextMenuY}
        onClose={() => (contextMenuTabId = null)} />
{/if}

{#if showTabBarContextMenu}
    <TabBarContextMenu
        x={tabBarContextMenuX}
        y={tabBarContextMenuY}
        onClose={() => (showTabBarContextMenu = false)} />
{/if}

<MruTabsPopup
    isOpen={mru.showPopup}
    onClose={() => (mru.showPopup = false)}
    onSelect={(id) => {
        appContext.app.activeTabId = id;
        pushToMru(id);
    }}
    selectedId={mru.isCycling
        ? appContext.editor.mruStack[mru.selectedIndex]
        : appContext.app.activeTabId} />
