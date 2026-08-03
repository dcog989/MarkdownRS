<script lang="ts">
  import { Copy, FilePen, FolderOpen, Trash2 } from 'lucide-svelte';
  import { _ } from 'svelte-i18n';
  import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
  import type { FileEntry } from '$lib/types/api';
  import { FileTreeContextMenuLogic } from './fileTreeContextMenuLogic.svelte';

  let { entry, x, y, onClose } = $props<{
    entry: FileEntry;
    x: number;
    y: number;
    onClose: () => void;
  }>();

  // svelte-ignore state_referenced_locally
  const ctx = new FileTreeContextMenuLogic(entry.path, entry.name, entry.is_dir, onClose);
</script>

<ContextMenu {x} {y} {onClose}>
  {#snippet children({ submenuSide: _submenuSide })}
    {#if !entry.is_dir}
      <button
        type="button"
        class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
        onclick={ctx.handleOpen}>
        <FolderOpen size={14} class="opacity-70" />
        <span class="flex-1">{$_('fileTree.open')}</span>
      </button>
    {/if}
    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={ctx.handleRename}>
      <FilePen size={14} class="opacity-70" />
      <span class="flex-1">{$_('fileTree.rename')}</span>
    </button>
    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={ctx.handleCopyPath}>
      <Copy size={14} class="opacity-70" />
      <span class="flex-1">{$_('fileTree.copyPath')}</span>
    </button>

    <div class="bg-border-main my-1 h-px"></div>

    <button
      type="button"
      class="text-ui-sm text-danger-text hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={ctx.handleDelete}>
      <Trash2 size={14} class="opacity-70" />
      <span class="flex-1">{$_('fileTree.deleteToWastebin')}</span>
    </button>
  {/snippet}
</ContextMenu>
