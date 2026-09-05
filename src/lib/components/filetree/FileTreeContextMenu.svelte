<script lang="ts">
import { Copy, FilePen, FilePlus, FolderOpen, FolderPlus, FolderSearch, Trash2 } from "lucide-svelte";
import { _ } from "svelte-i18n";
import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
import type { FileEntry } from "$lib/types/api";
import { FileTreeContextMenuLogic } from "./fileTreeContextMenuLogic.svelte";

let { entry, directory, x, y, onClose } = $props<{
  entry: FileEntry | null;
  directory: string;
  x: number;
  y: number;
  onClose: () => void;
}>();

// svelte-ignore state_referenced_locally
const ctx = new FileTreeContextMenuLogic(directory, entry, onClose);
</script>

<ContextMenu {x} {y} {onClose}>
  {#snippet children({ submenuSide: _submenuSide })}
    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={ctx.handleNewFile}
    >
      <FilePlus size={14} class="opacity-70" />
      <span class="flex-1">{$_('fileTree.newFile')}</span>
    </button>
    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={ctx.handleNewFolder}
    >
      <FolderPlus size={14} class="opacity-70" />
      <span class="flex-1">{$_('fileTree.newFolder')}</span>
    </button>

    {#if entry}
      <div class="bg-border-main my-1 h-px"></div>
      {#if !entry.is_dir}
        <button
          type="button"
          class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
          onclick={ctx.handleOpen}
        >
          <FolderOpen size={14} class="opacity-70" />
          <span class="flex-1">{$_('fileTree.open')}</span>
        </button>
      {/if}
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleRename}
      >
        <FilePen size={14} class="opacity-70" />
        <span class="flex-1">{$_('fileTree.rename')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleCopyPath}
      >
        <Copy size={14} class="opacity-70" />
        <span class="flex-1">{$_('fileTree.copyPath')}</span>
      </button>
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleRevealInFileManager}
      >
        <FolderSearch size={14} class="opacity-70" />
        <span class="flex-1">{$_('fileTree.revealInFileManager')}</span>
      </button>

      <div class="bg-border-main my-1 h-px"></div>

      <button
        type="button"
        class="text-ui-sm text-danger-text hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleDelete}
      >
        <Trash2 size={14} class="opacity-70" />
        <span class="flex-1">{$_('fileTree.deleteToWastebin')}</span>
      </button>
    {/if}
  {/snippet}
</ContextMenu>
