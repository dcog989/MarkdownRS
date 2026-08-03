<script lang="ts">
import { ChevronDown, Menu, Plus } from 'lucide-svelte';
import { onDestroy, onMount, tick } from 'svelte';
import { flip } from 'svelte/animate';
import { fade } from 'svelte/transition';
import { _ } from 'svelte-i18n';
import { SortableController } from '$lib/actions/sortable.svelte';
import { tooltip } from '$lib/actions/tooltip';
import MruTabsPopup from '$lib/components/ui/MruTabsPopup.svelte';
import TabBarContextMenu from '$lib/components/ui/TabBarContextMenu.svelte';
import TabBarMenu from '$lib/components/ui/TabBarMenu.svelte';
import TabButton from '$lib/components/ui/TabButton.svelte';
import TabContextMenu from '$lib/components/ui/TabContextMenu.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import { editorMetrics } from '$lib/stores/editorMetrics.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { createNewFile, pushToMru, reorderTabs } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { CONFIG } from '$lib/utils/config';
import { asHTMLElement, assertHTMLElement } from '$lib/utils/dom';
import { persistSessionDebounced, requestCloseTab } from '$lib/utils/fileSystem';
import { createMruCycling } from '$lib/utils/mruCycling.svelte';
import { shortcutManager } from '$lib/utils/shortcuts';

let scrollContainer = $state<HTMLElement>();
let showDropdown = $state(false);
let showMenu = $state(false);

let isDragging = $state(false);
let draggingId = $state<string | null>(null);
let dragOffsetX = $state(0);
let currentDragX = $state(0);

let contextMenuTabId: string | null = $state(null);

const PEEK_AMOUNT = 55;
const PLUS_BUTTON_WIDTH = 32;
const COLLAPSED_PIN_WIDTH = 36;
const TAB_GAP = 8;
let contextMenuX = $state(0);
let contextMenuY = $state(0);

let collapseMode = $state(false);
let collapseWidth = $state(0);
let showTabBarContextMenu = $state(false);
let tabBarContextMenuX = $state(0);
let tabBarContextMenuY = $state(0);

let mru = createMruCycling();

const sortController = new SortableController<EditorTab>({
    items: [],
    idKey: 'id',
    container: undefined,
    itemSelector: '[data-tab-item="true"]',
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

    if (scrollContainer) {
        resizeObserver = new ResizeObserver(() => updateTabWidths());
        resizeObserver.observe(scrollContainer);
    }

    return () => {
        resizeObserver?.disconnect();
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

let resizeObserver: ResizeObserver | undefined;

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

    const containerRect = scrollContainer.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    const isNearRight = tabRect.right > containerRect.right - PEEK_AMOUNT;
    const isNearLeft = tabRect.left < containerRect.left + PEEK_AMOUNT;

    const tabItem = activeEl.parentElement;
    const adjacent = isNearRight
        ? tabItem?.nextElementSibling
        : isNearLeft
          ? tabItem?.previousElementSibling
          : null;

    let targetLeft: number | null = null;
    if (adjacent instanceof HTMLElement) {
        // Scroll the adjacent tab (tab+1 / tab-1) into view alongside the
        // clicked tab, without pushing the clicked tab off-screen.
        if (isNearRight) {
            const revealNext =
                adjacent.offsetLeft + adjacent.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT;
            const keepActive = activeEl.offsetLeft - PEEK_AMOUNT;
            targetLeft = Math.min(revealNext, keepActive);
        } else {
            const revealPrev = adjacent.offsetLeft - PEEK_AMOUNT;
            const keepActive =
                activeEl.offsetLeft + activeEl.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT;
            targetLeft = Math.max(revealPrev, keepActive);
        }
    } else if (isNearRight) {
        targetLeft =
            activeEl.offsetLeft +
            activeEl.offsetWidth -
            scrollContainer.clientWidth +
            PEEK_AMOUNT;
    } else if (isNearLeft) {
        targetLeft = activeEl.offsetLeft - PEEK_AMOUNT;
    }

    if (targetLeft !== null) {
        scrollContainer.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }
}

$effect(() => {
    if (appContext.app.activeTabId) scrollToActive();
});

function measureTabNaturalWidth(tabEl: HTMLElement, tab: EditorTab): number {
    if (appContext.settings.collapsePinnedTabs && tab.isPinned) {
        return COLLAPSED_PIN_WIDTH;
    }

    const titleEl = tabEl.querySelector('span.pointer-events-none.truncate');
    if (!(titleEl instanceof HTMLElement)) {
        return appContext.settings.tabWidthMin;
    }

    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const titleWidth = range.getBoundingClientRect().width;
    range.detach();

    const icon = tabEl.querySelector('svg');
    const iconWidth = icon?.getBoundingClientRect().width ?? 14;
    const cs = getComputedStyle(tabEl);
    const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const border = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);

    const natural = iconWidth + TAB_GAP + padding + border + titleWidth;
    return Math.min(
        Math.max(natural, appContext.settings.tabWidthMin),
        appContext.settings.tabWidthMax,
    );
}

function updateTabWidths() {
    const container = scrollContainer;
    if (!container) return;

    const tabs = appContext.editor.tabs;
    if (tabs.length === 0) {
        collapseMode = false;
        return;
    }

    const available = container.clientWidth - PLUS_BUTTON_WIDTH;
    if (available <= 0) return;

    let sumNatural = 0;
    for (const tab of tabs) {
        const tabEl = container.querySelector(`[data-tab-id="${tab.id}"]`);
        const natural =
            tabEl instanceof HTMLElement
                ? measureTabNaturalWidth(tabEl, tab)
                : appContext.settings.tabWidthMin;
        sumNatural += natural;
    }

    if (sumNatural <= available) {
        collapseMode = false;
        return;
    }

    collapseMode = true;
    const pinnedCount = tabs.filter(
        (tab) => appContext.settings.collapsePinnedTabs && tab.isPinned,
    ).length;
    const nonPinnedCount = tabs.length - pinnedCount;
    const availableForNonPinned = available - pinnedCount * COLLAPSED_PIN_WIDTH;
    collapseWidth =
        nonPinnedCount > 0
            ? Math.max(
                  appContext.settings.tabWidthMin,
                  Math.floor(availableForNonPinned / nonPinnedCount),
              )
            : appContext.settings.tabWidthMin;
}

function tabItemWidth(tab: EditorTab): number | undefined {
    if (!collapseMode) return undefined;
    if (appContext.settings.collapsePinnedTabs && tab.isPinned) return COLLAPSED_PIN_WIDTH;
    return collapseWidth;
}

$effect(() => {
    void scrollContainer;
    void appContext.settings.tabWidthMin;
    void appContext.settings.tabWidthMax;
    void appContext.settings.collapsePinnedTabs;
    for (const tab of appContext.editor.tabs) {
        void tab.title;
        void tab.customTitle;
        void tab.isPinned;
    }
    updateTabWidths();
});

</script>

    <div class="bg-bg-panel relative flex h-8 w-full shrink-0 items-stretch">
    <div
        class="relative h-8 shrink-0 border-r border-b border-border-primary flex items-center justify-center"
        style:width={`${editorMetrics.gutterWidth}px`}>
        <button
            type="button"
            use:tooltip={$_('tabBar.switchTab')}
            class="text-fg-muted hover-surface flex h-full items-center gap-1 text-xs"
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
                class="fade-overlay-left pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-12"
                transition:fade={{ duration: 150 }}></div>
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
                    class="flex h-full min-w-0 touch-none items-stretch outline-none select-none"
                    data-tab-item="true"
                    animate:flip={{ duration: draggingId === tab.id ? 0 : 250 }}
                    style:opacity={isDragging && draggingId === tab.id ? 0.4 : 1}
                    style:z-index={isDragging && draggingId === tab.id ? 100 : 0}
                    style:flex={tabItemWidth(tab) !== undefined
                        ? `0 0 ${tabItemWidth(tab)}px`
                        : undefined}
                    onpointerdown={(e) =>
                        sortController.startDrag(
                            e,
                            tab.id,
                            assertHTMLElement(e.currentTarget, "TabBar drag"),
                        )}>
                    <TabButton
                        {tab}
                        width={tabItemWidth(tab)}
                        isActive={appContext.app.activeTabId === tab.id}
                        onclose={(_, id) => requestCloseTab(id)}
                        oncontextmenu={(e, id) => {
                            contextMenuTabId = id;
                            contextMenuX = e.clientX;
                            contextMenuY = e.clientY;
                        }} />
                </div>
            {/each}

            <button
                type="button"
                use:tooltip={`${$_('tabBar.newTab')}${shortcutManager.getShortcutDisplay('file.new') ? ` (${shortcutManager.getShortcutDisplay('file.new')})` : ''}`}
                class="text-fg-muted hover-surface flex h-8 w-8 shrink-0 items-center justify-center"
                onclick={async () => {
                    const newTabId = await createNewFile();
                    appContext.app.activeTabId = newTabId;
                }}>
                <Plus size={16} />
            </button>

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
                class="fade-overlay-right pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-12"
                transition:fade={{ duration: 150 }}></div>
        {/if}
    </div>

    <div class="flex h-full items-stretch border-l">
        <button
            type="button"
            use:tooltip={$_('tabBar.menu')}
            class="relative text-fg-muted hover-surface flex h-8 w-8 shrink-0 items-center justify-center"
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

<style>
    .fade-overlay-left {
        background: linear-gradient(to right, var(--surface-2), transparent);
    }

    .fade-overlay-right {
        background: linear-gradient(to left, var(--surface-2), transparent);
    }
</style>
