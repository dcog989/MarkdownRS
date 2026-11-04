<script lang="ts">
import Bookmark from "lucide-svelte/icons/bookmark";
import Columns2 from "lucide-svelte/icons/columns-2";
import Eye from "lucide-svelte/icons/eye";
import EyeOff from "lucide-svelte/icons/eye-off";
import Feather from "lucide-svelte/icons/feather";
import FolderTree from "lucide-svelte/icons/folder-tree";
import History from "lucide-svelte/icons/history";
import Settings from "lucide-svelte/icons/settings";
import Zap from "lucide-svelte/icons/zap";
import { tick } from "svelte";
import { _ } from "svelte-i18n";
import { toggleWriterMode } from "$lib/stores/appState.svelte";
import {
  toggleAbout,
  toggleBookmarks,
  toggleCommandPalette,
  toggleFileHistory,
  toggleSettings,
} from "$lib/stores/interfaceStore.svelte";
import { isSplitPaneActive, toggleSplitPane } from "$lib/stores/paneStore.svelte";
import { toggleFileTree, toggleSplitView } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { isMarkdownTab } from "$lib/utils/fileValidation";
import { saveSettings } from "$lib/utils/settings";
import { shortcutManager } from "$lib/utils/shortcuts";

let {
  showMenu = $bindable(false),
}: {
  showMenu?: boolean;
} = $props();

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
let isPreviewAvailable = $derived(isMarkdownTab(activeTab));

let shortcuts = $derived({
  settings: shortcutManager.getShortcutDisplay("window.settings"),
  commands: shortcutManager.getShortcutDisplay("window.commandPalette"),
  bookmarks: shortcutManager.getShortcutDisplay("window.bookmarks"),
  fileHistory: shortcutManager.getShortcutDisplay("file.fileHistory"),
  splitView: shortcutManager.getShortcutDisplay("view.toggleSplitView"),
  writerMode: shortcutManager.getShortcutDisplay("view.toggleWriterMode"),
  fileTree: shortcutManager.getShortcutDisplay("view.toggleFileTree"),
});

let menuEl = $state<HTMLElement | null>(null);

function closeMenu() {
  showMenu = false;
}

$effect(() => {
  if (showMenu) void tick().then(() => menuItems()[0]?.focus());
});

function menuItems(): HTMLElement[] {
  return [...(menuEl?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
}

function onMenuKeydown(event: KeyboardEvent) {
  const items = menuItems();
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  switch (event.key) {
    case "Escape":
      closeMenu();
      break;
    case "ArrowDown":
      items[(index + 1) % items.length]?.focus();
      break;
    case "ArrowUp":
      items[(index - 1 + items.length) % items.length]?.focus();
      break;
    case "Home":
      items[0]?.focus();
      break;
    case "End":
      items[items.length - 1]?.focus();
      break;
    default:
      return;
  }
  event.preventDefault();
}
</script>

{#if showMenu}
  <div aria-hidden="true" class="fixed inset-0 z-200" onclick={closeMenu}></div>
  <div
    bind:this={menuEl}
    role="menu"
    aria-label={$_("tabBar.menu")}
    tabindex="-1"
    class="bg-bg-panel border-border-secondary text-fg-default absolute top-full right-0 z-200 mt-1 rounded-lg border py-1 shadow-xl w-80"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onMenuKeydown}
  >
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleCommandPalette();
        closeMenu();
      }}
    >
      <Zap size={14} class="opacity-70" />
      <span class="flex-1">{$_("tabBarMenu.commandPalette")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.commands}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleBookmarks();
        closeMenu();
      }}
    >
      <Bookmark size={14} class="opacity-70" />
      <span class="flex-1">{$_("tabBarMenu.bookmarks")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.bookmarks}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleFileHistory();
        closeMenu();
      }}
    >
      <History size={14} class="opacity-70" />
      <span class="flex-1">{$_("tabBarMenu.fileHistory")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.fileHistory}</span>
    </button>

    <div class="bg-border-primary my-1 h-px"></div>

    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      class:opacity-50={!isPreviewAvailable}
      disabled={!isPreviewAvailable}
      aria-disabled={!isPreviewAvailable}
      onclick={() => {
        toggleSplitView();
        saveSettings();
        closeMenu();
      }}
    >
      {#if isPreviewAvailable}
        <Eye size={14} class="opacity-70" />
      {:else}
        <EyeOff size={14} class="opacity-50" />
      {/if}
      <span class="flex-1"
        >{$_(appContext.settings.splitView ? "command.hideSplitPreview" : "command.showSplitPreview")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.splitView}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        void toggleSplitPane();
        closeMenu();
      }}
    >
      <Columns2 size={14} class="opacity-70" />
      <span class="flex-1">{$_(isSplitPaneActive() ? "command.hideSplitEditor" : "command.showSplitEditor")}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleFileTree();
        saveSettings();
        closeMenu();
      }}
    >
      <FolderTree size={14} class="opacity-70" />
      <span class="flex-1"
        >{$_(appContext.settings.fileTreeVisible ? "command.hideFileTree" : "command.showFileTree")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.fileTree}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleWriterMode();
        closeMenu();
      }}
    >
      <Feather size={14} class="opacity-70" />
      <span class="flex-1">{$_(appContext.app.writerMode ? "command.exitWriterMode" : "command.enterWriterMode")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.writerMode}</span>
    </button>

    <div class="bg-border-primary my-1 h-px"></div>

    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleSettings();
        closeMenu();
      }}
    >
      <Settings size={14} class="opacity-70" /><span class="flex-1">{$_("tabBarMenu.settings")}</span
      ><span class="ml-auto text-ui-sm opacity-40">{shortcuts.settings}</span>
    </button>
    <button
      type="button"
      role="menuitem"
      class="text-ui menu-item"
      onclick={() => {
        toggleAbout();
        closeMenu();
      }}
    >
      <img src="/logo.svg" alt="" class="h-4 w-4"><span>{$_("tabBarMenu.about")}</span>
    </button>
  </div>
{/if}
