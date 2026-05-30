<script lang="ts">
import {
    Bookmark,
    ChevronDown,
    Eye,
    EyeOff,
    Feather,
    Menu,
    Plus,
    Settings,
    Zap,
} from 'lucide-svelte';
import { onDestroy, onMount, tick } from 'svelte';
import { flip } from 'svelte/animate';
import { fade } from 'svelte/transition';
import { SortableController } from '$lib/actions/sortable.svelte.ts';
import MruTabsPopup from '$lib/components/ui/MruTabsPopup.svelte';
import TabBarContextMenu from '$lib/components/ui/TabBarContextMenu.svelte';
import TabButton from '$lib/components/ui/TabButton.svelte';
import TabContextMenu from '$lib/components/ui/TabContextMenu.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import { toggleSplitView, toggleWriterMode } from '$lib/stores/appState.svelte';
import { addTab, pushToMru, reorderTabs } from '$lib/stores/editorStore.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
import {
    toggleAbout,
    toggleBookmarks,
    toggleCommandPalette,
    toggleSettings,
} from '$lib/stores/interfaceStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { CONFIG } from '$lib/utils/config';
import { asHTMLElement, assertHTMLElement } from '$lib/utils/dom';
import { persistSessionDebounced, requestCloseTab } from '$lib/utils/fileSystem';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';
import { shortcutManager } from '$lib/utils/shortcuts';

let scrollContainer = $state<HTMLElement>();
let showDropdown = $state(false);
let showMenu = $state(false);

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
let isPreviewAvailable = $derived(
    activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true,
);

let shortcuts = $derived({
    settings: shortcutManager.getShortcutDisplay('help.settings'),
    commands: shortcutManager.getShortcutDisplay('window.commandPalette'),
    bookmarks: shortcutManager.getShortcutDisplay('window.bookmarks'),
    splitView: shortcutManager.getShortcutDisplay('view.toggleSplitView'),
    writerMode: shortcutManager.getShortcutDisplay('view.toggleWriterMode'),
});

function toggleSplit() {
    if (!isPreviewAvailable) {
        showToast('warning', 'Preview not available for this file type');
        return;
    }
    toggleSplitView();
    saveSettings();
}

function handleWriterMode() {
    const wasWriterMode = appContext.app.writerMode;
    toggleWriterMode();
    if (wasWriterMode) {
        document.exitFullscreen().catch(() => {});
    } else {
        document.documentElement.requestFullscreen().catch(() => {});
    }
}

function closeMenu() {
    showMenu = false;
}

let isDragging = $state(false);
let draggingId = $state<string | null>(null);
let dragOffsetX = $state(0);
let currentDragX = $state(0);

let contextMenuTabId: string | null = $state(null);
let contextMenuX = $state(0);
let contextMenuY = $state(0);
let showTabBarContextMenu = $state(false);
let tabBarContextMenuX = $state(0);
let tabBarContextMenuY = $state(0);
let showMruPopup = $state(false);
let mruSelectedIndex = $state(0);
let isMruCycling = $state(false);
let mruTimer: number | null = null;

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
    // Trigger fade indicator update when tab count changes
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
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            if (!isMruCycling) {
                isMruCycling = true;
                mruSelectedIndex = appContext.editor.mruStack.length > 1 ? 1 : 0;
                if (mruTimer) clearTimeout(mruTimer);
                mruTimer = window.setTimeout(
                    () => (showMruPopup = true),
                    CONFIG.UI_TIMING.MRU_POPUP_DELAY_MS,
                );
            } else {
                mruSelectedIndex = (mruSelectedIndex + 1) % appContext.editor.mruStack.length;
                showMruPopup = true;
                if (mruTimer) clearTimeout(mruTimer);
            }
        }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Control' || !e.ctrlKey) {
            if (isMruCycling) {
                if (mruTimer) clearTimeout(mruTimer);
                const targetId = appContext.editor.mruStack[mruSelectedIndex];
                if (targetId) {
                    appContext.app.activeTabId = targetId;
                    pushToMru(targetId);
                }
                isMruCycling = false;
                showMruPopup = false;
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        if (mruTimer) {
            clearTimeout(mruTimer);
            mruTimer = null;
        }
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
});

onDestroy(() => {
    if (mruTimer) {
        clearTimeout(mruTimer);
        mruTimer = null;
    }
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
    const PEEK_AMOUNT = 55;

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

<div class="bg-bg-panel relative flex h-9 w-full shrink-0 items-stretch border-b">
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
                style="background: linear-gradient(to right, var(--color-bg-panel), transparent);"></div>
        {/if}

        <section
            bind:this={scrollContainer}
            role="list"
            class="no-scrollbar tab-scroll-container flex h-full w-full items-stretch overflow-x-auto"
            onscroll={updateFadeIndicators}
            oncontextmenu={(e) => {
                // Check if the right-click is on an empty area (not on a tab)
                const target = asHTMLElement(e.target);
                if (!target) return;
                if (
                    target.classList.contains("tab-scroll-container") ||
                    target
                        .closest("section")
                        ?.classList.contains("tab-scroll-container")
                ) {
                    // Only show context menu if we didn't click on a tab button
                    if (
                        !target.closest('[role="listitem"]') &&
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
                    class="flex h-full shrink-0 touch-none items-stretch outline-none select-none"
                    animate:flip={{ duration: draggingId === tab.id ? 0 : 250 }}
                    role="listitem"
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
        </section>

        {#if showRightFade}
            <div
                class="pointer-events-none absolute top-0 right-0 bottom-0 z-20 w-12"
                transition:fade={{ duration: 150 }}
                style="background: linear-gradient(to left, var(--color-bg-panel), transparent);"></div>
        {/if}
    </div>

    <div class="flex h-full items-stretch border-l">
        <button
            type="button"
            class="text-fg-muted hover-surface flex h-9 w-9 shrink-0 items-center justify-center"
            onclick={() => {
                const newTabId = addTab();
                appContext.app.activeTabId = newTabId;
            }}>
            <Plus size={16} />
        </button>
        <div class="relative flex h-full items-stretch">
            <button
                type="button"
                class="text-fg-muted hover-surface flex h-9 w-9 shrink-0 items-center justify-center"
                onclick={() => (showMenu = !showMenu)}>
                <Menu size={16} />
            </button>
            {#if showMenu}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={closeMenu}></div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="bg-bg-panel border-border-light text-fg-default absolute top-full right-0 z-50 mt-1 rounded-md border py-1 shadow-xl w-80"
                    onclick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={() => {
                            toggleAbout();
                            closeMenu();
                        }}>
                        <img src="/logo.svg" alt="" class="h-4 w-4" /><span>About MarkdownRS</span>
                    </button>

                    <div class="bg-border-main my-1 h-px"></div>

                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={() => {
                            toggleSettings();
                            closeMenu();
                        }}>
                        <Settings size={14} class="opacity-70" /><span class="flex-1">Settings</span
                        ><span class="ml-auto text-xs opacity-40">{shortcuts.settings}</span>
                    </button>
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={() => {
                            toggleCommandPalette();
                            closeMenu();
                        }}>
                        <Zap size={14} class="opacity-70" />
                        <span class="flex-1">Command Palette</span
                        ><span class="ml-auto text-xs opacity-40">{shortcuts.commands}</span>
                    </button>
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={() => {
                            toggleBookmarks();
                            closeMenu();
                        }}>
                        <Bookmark size={14} class="opacity-70" />
                        <span class="flex-1">Bookmarks</span
                        ><span class="ml-auto text-xs opacity-40">{shortcuts.bookmarks}</span>
                    </button>

                    <div class="bg-border-main my-1 h-px"></div>

                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        onclick={() => {
                            handleWriterMode();
                            closeMenu();
                        }}>
                        <Feather size={14} class="opacity-70" />
                        <span class="flex-1">Writer Mode</span
                        ><span class="ml-auto text-xs opacity-40">{shortcuts.writerMode}</span>
                    </button>
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                        class:opacity-50={!isPreviewAvailable}
                        class:cursor-not-allowed={!isPreviewAvailable}
                        onclick={() => {
                            if (isPreviewAvailable) {
                                toggleSplit();
                                closeMenu();
                            }
                        }}>
                        {#if isPreviewAvailable}
                            <Eye size={14} class="opacity-70" />
                        {:else}
                            <EyeOff size={14} class="opacity-50" />
                        {/if}
                        <span class="flex-1">Toggle Split Preview</span
                        ><span class="ml-auto text-xs opacity-40">{shortcuts.splitView}</span>
                    </button>
                </div>
            {/if}
        </div>
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
    isOpen={showMruPopup}
    onClose={() => (showMruPopup = false)}
    onSelect={(id) => {
        appContext.app.activeTabId = id;
        pushToMru(id);
    }}
    selectedId={isMruCycling
        ? appContext.editor.mruStack[mruSelectedIndex]
        : appContext.app.activeTabId} />

<style>
.tab-scroll-container {
    pointer-events: auto;
}
</style>
