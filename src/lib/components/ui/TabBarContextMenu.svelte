<script lang="ts">
import { FilePlus, Files, Save } from "lucide-svelte";
import { _ } from "svelte-i18n";
import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
import Submenu from "$lib/components/ui/Submenu.svelte";
import { createNewFile } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { closeManyTabs, saveAllFiles } from "$lib/utils/fileSystem";
import { shortcutManager } from "$lib/utils/shortcuts";

let { x, y, onClose } = $props<{
  x: number;
  y: number;
  onClose: () => void;
}>();

let activeSubmenu = $state<"close" | null>(null);
let newTabShortcut = $derived(shortcutManager.getShortcutDisplay("file.new"));
let saveAllShortcut = $derived(shortcutManager.getShortcutDisplay("file.saveAll"));

let hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty));
let hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty));
let hasPinnedTabs = $derived(appContext.editor.tabs.some((t) => t.isPinned));
let hasUnpinnedTabs = $derived(appContext.editor.tabs.some((t) => !t.isPinned));

async function handleCloseMany(mode: "saved" | "unsaved" | "all" | "unpinned") {
  await closeManyTabs(mode);
  onClose();
}

async function handleSaveAll() {
  await saveAllFiles();
  onClose();
}

async function handleNewTab() {
  const newTabId = await createNewFile();
  appContext.app.activeTabId = newTabId;
  onClose();
}
</script>

<ContextMenu {x} {y} {onClose}>
  {#snippet children({ submenuSide: _submenuSide })}
    <div onmouseenter={() => (activeSubmenu = null)} role="none">
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={handleNewTab}
      >
        <FilePlus size={14} class="opacity-70" /><span class="flex-1">{$_('tabBarContextMenu.newTab')}</span>
        {#if newTabShortcut}
          <span class="text-xs opacity-40">{newTabShortcut}</span>
        {/if}
      </button>

      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        disabled={!hasUnsavedTabs}
        onclick={handleSaveAll}
      >
        <Save size={14} class="opacity-70" /><span class="flex-1">{$_('tabBarContextMenu.saveAll')}</span>
        {#if saveAllShortcut}
          <span class="text-xs opacity-40">{saveAllShortcut}</span>
        {/if}
      </button>

      <div class="bg-border-main my-1 h-px"></div>
    </div>

    <Submenu
      show={activeSubmenu === 'close'}
      side={_submenuSide}
      onOpen={() => (activeSubmenu = 'close')}
      onClose={() => {
                if (activeSubmenu === 'close') activeSubmenu = null;
            }}
    >
      {#snippet trigger()}
        <button type="button" class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
          <Files size={14} class="mr-2 opacity-70" />
          <span>{$_('tabBarContextMenu.closeMany')}</span>
          <span class="ml-auto opacity-60">›</span>
        </button>
      {/snippet}

      <button
        type="button"
        class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
        disabled={!hasSavedTabs}
        onclick={() => handleCloseMany('saved')}
      >
        {$_('tabBarContextMenu.closeSaved')}
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
        disabled={!hasUnsavedTabs}
        onclick={() => handleCloseMany('unsaved')}
      >
        {$_('tabBarContextMenu.closeNotSaved')}
      </button>
      {#if hasPinnedTabs}
        <button
          type="button"
          class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
          disabled={!hasUnpinnedTabs}
          onclick={() => handleCloseMany('unpinned')}
        >
          {$_('tabBarContextMenu.closeUnpinned')}
        </button>
      {/if}
      <button
        type="button"
        class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
        onclick={() => handleCloseMany('all')}
      >
        {$_('tabBarContextMenu.closeAll')}
      </button>
    </Submenu>
  {/snippet}
</ContextMenu>
