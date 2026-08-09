<script lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkX,
  Copy,
  Download,
  FileDown,
  FilePen,
  Files,
  FolderSearch,
  History,
  Pin,
  PinOff,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import Submenu from '$lib/components/ui/Submenu.svelte';
import { TabContextMenuLogic } from './tabContextMenuLogic.svelte';

let { tabId, x, y, onClose } = $props<{
  tabId: string;
  x: number;
  y: number;
  onClose: () => void;
}>();

// svelte-ignore state_referenced_locally
const ctx = new TabContextMenuLogic(tabId, onClose);
</script>

<ContextMenu {x} {y} {onClose}>
  {#snippet children({ submenuSide: _submenuSide })}
    <div onmouseenter={() => (ctx.activeSubmenu = null)} role="none">
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleSave}
      >
        <Save size={14} class="opacity-70" />
        <span class="flex-1">{$_('tabContextMenu.save')}</span>
        {#if ctx.sc('file.save')}
          <span class="ml-auto text-xs opacity-40">{ctx.sc('file.save')}</span>
        {/if}
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleSaveAs}
      >
        <FileDown size={14} class="opacity-70" />
        <span class="flex-1">{$_('tabContextMenu.saveAs')}</span>
        {#if ctx.sc('file.saveAs')}
          <span class="ml-auto text-xs opacity-40">{ctx.sc('file.saveAs')}</span>
        {/if}
      </button>

      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handlePin}
      >
        {#if ctx.isPinned}
          <PinOff size={14} class="opacity-70" /><span>{$_('tabContextMenu.unpin')}</span>
        {:else}
          <Pin size={14} class="opacity-70" /><span>{$_('tabContextMenu.pin')}</span>
        {/if}
      </button>

      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!ctx.tab?.path}
        onclick={ctx.handleToggleBookmark}
      >
        {#if ctx.isBookmarked}
          <BookmarkX size={14} class="opacity-70" />
          <span class="flex-1">{$_('tabContextMenu.removeBookmark')}</span>
        {:else}
          <Bookmark size={14} class="opacity-70" />
          <span class="flex-1">{$_('tabContextMenu.addBookmark')}</span>
          {#if ctx.sc('markdown.bookmark')}
            <span class="ml-auto text-xs opacity-40">{ctx.sc('markdown.bookmark')}</span>
          {/if}
        {/if}
      </button>

      <div class="bg-border-main my-1 h-px"></div>
    </div>

    <Submenu
      show={ctx.activeSubmenu === 'export'}
      side={_submenuSide}
      onOpen={() => (ctx.activeSubmenu = 'export')}
      onClose={() => {
        if (ctx.activeSubmenu === 'export') ctx.activeSubmenu = null;
      }}
    >
      {#snippet trigger()}
        <button type="button" class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
          <Download size={14} class="mr-2 opacity-70" />
          <span>{$_('tabContextMenu.export')}</span>
          <span class="ml-auto opacity-60">›</span>
        </button>
      {/snippet}

      {#each ctx.exportItems as item}
        <button type="button" class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left" onclick={item.handler}>
          {item.label}
        </button>
      {/each}
    </Submenu>

    <div class="bg-border-main my-1 h-px" onmouseenter={() => (ctx.activeSubmenu = null)} role="none"></div>

    <div onmouseenter={() => (ctx.activeSubmenu = null)} role="none">
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={ctx.tabIndex === 0}
        onclick={() => ctx.handleMoveTab('start')}
      >
        <ArrowLeft size={14} class="opacity-70" /><span>{$_('tabContextMenu.moveToStart')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={ctx.tabIndex === ctx.totalTabs - 1}
        onclick={() => ctx.handleMoveTab('end')}
      >
        <ArrowRight size={14} class="opacity-70" /><span>{$_('tabContextMenu.moveToEnd')}</span>
      </button>

      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={ctx.isPinned}
        onclick={ctx.handleClose}
      >
        <X size={14} class="opacity-70" />
        <span class="flex-1">{$_('tabContextMenu.close')}</span>
        {#if ctx.sc('file.closeTab')}
          <span class="ml-auto text-xs opacity-40">{ctx.sc('file.closeTab')}</span>
        {/if}
      </button>
    </div>

    <Submenu
      show={ctx.activeSubmenu === 'close'}
      side={_submenuSide}
      onOpen={() => (ctx.activeSubmenu = 'close')}
      onClose={() => {
        if (ctx.activeSubmenu === 'close') ctx.activeSubmenu = null;
      }}
    >
      {#snippet trigger()}
        <button type="button" class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
          <Files size={14} class="mr-2 opacity-70" />
          <span>{$_('tabContextMenu.closeMany')}</span>
          <span class="ml-auto opacity-60">›</span>
        </button>
      {/snippet}

      {#each ctx.closeManyItems as item}
        <button
          type="button"
          class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={item.disabled}
          onclick={() => ctx.handleCloseMany(item.mode)}
        >
          {item.label}
        </button>
      {/each}
    </Submenu>

    <div class="bg-border-main my-1 h-px" onmouseenter={() => (ctx.activeSubmenu = null)} role="none"></div>

    <div onmouseenter={() => (ctx.activeSubmenu = null)} role="none">
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left {ctx.hasClosedTabs
          ? ''
          : 'opacity-50'}"
        disabled={!ctx.hasClosedTabs}
        onclick={() => ctx.handleReopenClosed(0)}
      >
        <History size={14} class="opacity-70" />
        <span class="flex-1">{$_('tabContextMenu.reopenLastClosed')}</span>
        {#if ctx.sc('edit.reopenClosedTab')}
          <span class="ml-auto text-xs opacity-40">{ctx.sc('edit.reopenClosedTab')}</span>
        {/if}
      </button>
    </div>

    <Submenu
      show={ctx.activeSubmenu === 'restore'}
      side={_submenuSide}
      onOpen={() => (ctx.activeSubmenu = 'restore')}
      onClose={() => {
        if (ctx.activeSubmenu === 'restore') ctx.activeSubmenu = null;
      }}
    >
      {#snippet trigger()}
        <button
          type="button"
          class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left {ctx.hasClosedTabs
            ? ''
            : 'opacity-50'}"
        >
          <Undo2 size={14} class="mr-2 opacity-70" />
          <span>{$_('tabContextMenu.reopenRecent')}</span>
          <span class="ml-auto opacity-60">›</span>
        </button>
      {/snippet}

      {#if ctx.hasClosedTabs}
        {#each ctx.closedTabs as item, i (item.tab.id)}
          <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center justify-between px-3 py-1.5 text-left"
            use:tooltip={ctx.getHistoryTooltip(item.tab)}
            onclick={() => ctx.handleReopenClosed(i)}
          >
            <span>{ctx.formatTitle(item.tab.customTitle || item.tab.title)}</span>
          </button>
        {/each}
      {:else}
        <div class="text-fg-muted px-3 py-2 text-sm">{$_('tabContextMenu.historyEmpty')}</div>
      {/if}
    </Submenu>

    <div onmouseenter={() => (ctx.activeSubmenu = null)} role="none">
      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleRename}
      >
        <FilePen size={14} class="opacity-70" /><span>{$_('tabContextMenu.rename')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleCopyTitle}
      >
        <Copy size={14} class="opacity-70" /><span>{$_('tabContextMenu.copyFileName')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!ctx.tab?.path}
        onclick={ctx.handleCopyPath}
      >
        <Copy size={14} class="opacity-70" /><span>{$_('tabContextMenu.copyFullPath')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!ctx.tab?.path || ctx.isFileMissing}
        onclick={ctx.handleRevealInFileManager}
      >
        <FolderSearch size={14} class="opacity-70" /><span>{$_('tabContextMenu.revealInFileManager')}</span>
      </button>

      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm text-danger-text hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!ctx.tab?.path || ctx.isPinned || ctx.isFileMissing}
        onclick={ctx.handleSendToRecycleBin}
      >
        <Trash2 size={14} class="opacity-70" /><span>{$_('tabContextMenu.deleteToWastebin')}</span>
      </button>
    </div>
  {/snippet}
</ContextMenu>
