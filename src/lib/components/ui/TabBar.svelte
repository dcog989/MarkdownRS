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

let dragBarTop = $state(0);
let dragGhostTab = $state<EditorTab | null>(null);

let contextMenuTabId: string | null = $state(null);

const PEEK_AMOUNT = 55;
let effectiveTabWidthMin = $derived(Math.min(appContext.settings.tabWidthMin, appContext.settings.tabWidthMax));
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
  itemSelector: '[data-tab-item="true"]',
  onSort: (newItems) => {
    reorderTabs(newItems);
  },
  onDragEnd: () => {
    if (sortController.isDragging) {
      persistSessionDebounced();
    } else if (sortController.draggingId) {
      appContext.app.activeTabId = sortController.draggingId;
      pushToMru(sortController.draggingId);
    }
    dragGhostTab = null;
    tick().then(updateFadeIndicators);
  },
});

$effect(() => {
  if (sortController.draggingId && !sortController.isDragging) {
    dragGhostTab = appContext.editor.tabs.find((t) => t.id === sortController.draggingId) ?? null;
    dragBarTop = scrollContainer?.getBoundingClientRect().top ?? 0;
  }
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
    resizeObserver = new ResizeObserver(() => updateFadeIndicators());
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
  if (!scrollContainer || sortController.isDragging) return;

  await new Promise((resolve) => setTimeout(resolve, CONFIG.UI_TIMING.TAB_SCROLL_SETTLE_MS));

  const activeEl = scrollContainer.querySelector('[data-active="true"]');
  if (!(activeEl instanceof HTMLElement)) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const tabRect = activeEl.getBoundingClientRect();
  const isNearRight = tabRect.right > containerRect.right - PEEK_AMOUNT;
  const isNearLeft = tabRect.left < containerRect.left + PEEK_AMOUNT;

  const tabItem = activeEl.parentElement;
  const adjacent = isNearRight ? tabItem?.nextElementSibling : isNearLeft ? tabItem?.previousElementSibling : null;

  let targetLeft: number | null = null;
  if (adjacent instanceof HTMLElement) {
    // Scroll the adjacent tab (tab+1 / tab-1) into view alongside the
    // clicked tab, without pushing the clicked tab off-screen.
    if (isNearRight) {
      const revealNext = adjacent.offsetLeft + adjacent.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT;
      const keepActive = activeEl.offsetLeft - PEEK_AMOUNT;
      targetLeft = Math.min(revealNext, keepActive);
    } else {
      const revealPrev = adjacent.offsetLeft - PEEK_AMOUNT;
      const keepActive = activeEl.offsetLeft + activeEl.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT;
      targetLeft = Math.max(revealPrev, keepActive);
    }
  } else if (isNearRight) {
    targetLeft = activeEl.offsetLeft + activeEl.offsetWidth - scrollContainer.clientWidth + PEEK_AMOUNT;
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

// Tab sizing is pure CSS. Each tab is a flex item with `flex: 0 1 auto`
// (content width, grow never, shrink when the bar is full) bounded below by
// the tab min width setting and above by the tab max width setting. When the
// bar has room, tabs sit at their content width; when the bar is full they
// collapse toward the min width setting; once every tab is at its min width
// the bar scrolls instead of squeezing further. The TabButton inside relies
// on `min-w-0` so it can shrink to the clamped wrapper width and truncate its
// title. Pinned tabs drop the min/max clamps and never shrink so they always
// size to their content (icon + title + pin). No JS measurement is needed.

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
  tick().then(updateFadeIndicators);
});
</script>

<div class="bg-bg-panel relative flex h-8 w-full shrink-0 items-stretch">
  <div
    class="relative h-8 shrink-0 border-r border-b border-border-primary flex items-center justify-center"
    style:width={`${editorMetrics.gutterWidth}px`}
  >
    <button
      type="button"
      use:tooltip={$_('tabBar.switchTab')}
      class="text-fg-muted hover-surface flex h-full items-center gap-1 text-xs"
      onclick={() => (showDropdown = !showDropdown)}
    >
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
      onClose={() => (showDropdown = false)}
    />
  </div>
  <div class="relative h-full min-w-0 flex-1">
    {#if showLeftFade}
      <div
        class="fade-overlay-left pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-12"
        transition:fade={{ duration: 150 }}
      ></div>
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
            }}
    >
      {#each appContext.editor.tabs as tab (tab.id)}
        {@const isTabCollapsed = appContext.settings.collapsePinnedTabs && tab.isPinned}
        <div
          role="tab"
          tabindex="-1"
          class="flex h-full touch-none items-stretch outline-none select-none"
          data-tab-item="true"
          animate:flip={{ duration: sortController.draggingId === tab.id ? 0 : 250 }}
          style:opacity={sortController.isDragging && sortController.draggingId === tab.id ? 0.4 : 1}
          style:z-index={sortController.isDragging && sortController.draggingId === tab.id ? 100 : 0}
          style:flex={isTabCollapsed || tab.isPinned ? '0 0 auto' : '0 1 auto'}
          style:min-width={isTabCollapsed || tab.isPinned
                        ? 'auto'
                        : `${effectiveTabWidthMin}px`}
          style:max-width={isTabCollapsed || tab.isPinned
                        ? 'none'
                        : `${appContext.settings.tabWidthMax}px`}
          onpointerdown={(e) =>
                        sortController.startDrag(
                            e,
                            tab.id,
                            assertHTMLElement(e.currentTarget, "TabBar drag"),
                        )}
        >
          <TabButton
            {tab}
            isActive={appContext.app.activeTabId === tab.id}
            onclose={(_, id) => requestCloseTab(id)}
            oncontextmenu={(e, id) => {
                            contextMenuTabId = id;
                            contextMenuX = e.clientX;
                            contextMenuY = e.clientY;
                        }}
          />
        </div>
      {/each}

      <button
        type="button"
        use:tooltip={`${$_('tabBar.newTab')}${shortcutManager.getShortcutDisplay('file.new') ? ` (${shortcutManager.getShortcutDisplay('file.new')})` : ''}`}
        class="text-fg-muted hover-surface flex h-8 w-8 shrink-0 items-center justify-center"
        onclick={async () => {
                    const newTabId = await createNewFile();
                    appContext.app.activeTabId = newTabId;
                }}
      >
        <Plus size={16} />
      </button>

      {#if sortController.isDragging && sortController.draggingId}
        {#if dragGhostTab}
          <div
            class="pointer-events-none fixed z-999"
            style:left="0"
            style:top={`${dragBarTop}px`}
            style:transform={`translateX(${sortController.currentDragX - sortController.dragOffsetX}px)`}
            style:opacity="0.95"
          >
            <TabButton tab={dragGhostTab} isActive={appContext.app.activeTabId === dragGhostTab.id} />
          </div>
        {/if}
      {/if}
    </div>

    {#if showRightFade}
      <div
        class="fade-overlay-right pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-12"
        transition:fade={{ duration: 150 }}
      ></div>
    {/if}
  </div>

  <div class="flex h-full items-stretch border-l">
    <button
      type="button"
      use:tooltip={$_('tabBar.menu')}
      class="relative text-fg-muted hover-surface flex h-8 w-8 shrink-0 items-center justify-center"
      onclick={() => (showMenu = !showMenu)}
    >
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
    onClose={() => (contextMenuTabId = null)}
  />
{/if}

{#if showTabBarContextMenu}
  <TabBarContextMenu x={tabBarContextMenuX} y={tabBarContextMenuY} onClose={() => (showTabBarContextMenu = false)} />
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
        : appContext.app.activeTabId}
/>

<style>
.fade-overlay-left {
  background: linear-gradient(to right, var(--surface-2), transparent);
}

.fade-overlay-right {
  background: linear-gradient(to left, var(--surface-2), transparent);
}
</style>
