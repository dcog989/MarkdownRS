<script lang="ts">
import { Eye, EyeOff, FileText, FolderTree, FoldVertical, Lock, LockOpen, RefreshCw } from "lucide-svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import {
  collapseAll,
  fileTreeStore,
  refreshTree,
  toggleHiddenFiles,
  toggleMarkdownOnly,
} from "$lib/stores/fileTreeStore.svelte";
import { settingsState, toggleFileTree, toggleFileTreeLocked } from "$lib/stores/settingsState.svelte";
import { saveSettings } from "$lib/utils/settings";

function handleLockToggle() {
  toggleFileTreeLocked();
  if (settingsState.fileTreeLocked) {
    settingsState.fileTreeLockedRoot = fileTreeStore.root;
  } else {
    settingsState.fileTreeLockedRoot = "";
  }
  saveSettings();
}
</script>

<div class="border-border-light flex h-8 shrink-0 items-center gap-1 border-b pl-2 pr-1">
  <div class="text-fg-muted flex shrink-0 items-center">
    <button
      type="button"
      class="hover-surface flex h-6 w-6 items-center justify-center rounded"
      class:bg-bg-active={settingsState.fileTreeShowHidden}
      class:text-accent-secondary={settingsState.fileTreeShowHidden}
      use:tooltip={$_('fileTree.showHidden')}
      onclick={() => {
        toggleHiddenFiles();
        saveSettings();
      }}
    >
      {#if settingsState.fileTreeShowHidden}
        <Eye size={14} />
      {:else}
        <EyeOff size={14} />
      {/if}
    </button>
    <button
      type="button"
      class="hover-surface flex h-6 w-6 items-center justify-center rounded"
      class:bg-bg-active={settingsState.fileTreeShowMarkdownOnly}
      class:text-accent-secondary={settingsState.fileTreeShowMarkdownOnly}
      use:tooltip={$_('fileTree.showMarkdownOnly')}
      onclick={() => {
        toggleMarkdownOnly();
        saveSettings();
      }}
    >
      <FileText size={14} />
    </button>
    <button
      type="button"
      class="hover-surface flex h-6 w-6 items-center justify-center rounded"
      class:bg-bg-active={settingsState.fileTreeLocked}
      class:text-accent-secondary={settingsState.fileTreeLocked}
      aria-label={$_(
        settingsState.fileTreeLocked ? 'fileTree.unlockTree' : 'fileTree.lockTree',
      )}
      use:tooltip={$_(
        settingsState.fileTreeLocked ? 'fileTree.unlockTree' : 'fileTree.lockTree',
      )}
      onclick={handleLockToggle}
    >
      {#if settingsState.fileTreeLocked}
        <LockOpen size={14} />
      {:else}
        <Lock size={14} />
      {/if}
    </button>
    <button
      type="button"
      class="hover-surface flex h-6 w-6 items-center justify-center rounded"
      use:tooltip={$_('fileTree.collapseAll')}
      onclick={collapseAll}
    >
      <FoldVertical size={14} />
    </button>
    <button
      type="button"
      class="hover-surface flex h-6 w-6 items-center justify-center rounded"
      class:pointer-events-none={fileTreeStore.refreshing}
      use:tooltip={$_('fileTree.refresh')}
      onclick={() => void refreshTree()}
    >
      <span class:animate-spin={fileTreeStore.refreshing} class="flex">
        <RefreshCw size={14} />
      </span>
    </button>
  </div>
  <div class="text-fg-muted ml-auto flex shrink-0 items-center">
    <button
      type="button"
      class="bg-bg-active text-accent-secondary hover-surface flex h-6 w-6 items-center justify-center rounded"
      use:tooltip={$_('tabBar.hideFileTree')}
      onclick={() => {
        toggleFileTree();
        saveSettings();
      }}
    >
      <FolderTree size={14} />
    </button>
  </div>
</div>
