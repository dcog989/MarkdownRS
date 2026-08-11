<script lang="ts">
import { ChevronDown, ChevronRight, FolderTree, Menu } from 'lucide-svelte';
import { onDestroy } from 'svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import AppLifecycle from '$lib/components/app/AppLifecycle.svelte';
import Editor from '$lib/components/editor/Editor.svelte';
import { createSplitResize } from '$lib/components/editor/logic/splitResize.svelte';
import FileTree from '$lib/components/filetree/FileTree.svelte';
import Preview from '$lib/components/preview/Preview.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import StatusBar from '$lib/components/ui/StatusBar.svelte';
import TabBar from '$lib/components/ui/TabBar.svelte';
import TabBarMenu from '$lib/components/ui/TabBarMenu.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import { pushToMru, tabsById } from '$lib/stores/editorStore.svelte';
import { toggleFileTree } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';

const splitResize = createSplitResize();

let mainContainer = $state<HTMLDivElement>();

function handleToggleFileTree() {
  toggleFileTree();
  saveSettings();
}

let activeTab = $derived(tabsById().get(appContext.app.activeTabId ?? ''));

let isMarkdown = $derived.by(() => {
  if (!activeTab) return true;
  if (activeTab.path) return isMarkdownFile(activeTab.path);
  return activeTab.preferredExtension !== 'txt';
});

let showPreview = $derived(appContext.settings.splitView && isMarkdown);
let showWriterTabDropdown = $state(false);
let showWriterMenu = $state(false);
let peekHovered = $state(false);

onDestroy(() => {
  splitResize.cleanup();
});

function onResizeMouseDown(e: MouseEvent) {
  if (mainContainer) splitResize.registerContainer(mainContainer);
  splitResize.startResize(e);
}
</script>

<AppLifecycle>
  <div class="app-shell bg-bg-main text-fg-default flex h-screen w-screen flex-col overflow-hidden">
    <div class="relative z-0 flex flex-1 overflow-hidden outline-none" class:writer-mode={appContext.app.writerMode}>
      {#if !appContext.app.writerMode}
        {#if appContext.settings.fileTreeVisible}
          <FileTree />
        {:else}
          <div
            role="group"
            class="ft-peek-edge shrink-0"
            class:ft-peek-edge-hover={peekHovered}
            onmouseenter={() => (peekHovered = true)}
            onmouseleave={() => (peekHovered = false)}
          >
            <button
              type="button"
              aria-label={$_('fileTree.showFileTree')}
              class="ft-peek-toolbar"
              use:tooltip={$_('fileTree.showFileTree')}
              onclick={handleToggleFileTree}
            >
              <FolderTree
                size={14}
                class="shrink-0 transition-colors {peekHovered ? 'text-fg-default' : 'text-fg-muted'}"
              />
            </button>
            <div class="flex min-h-0 flex-1 items-center justify-center">
              <button
                type="button"
                aria-label={$_('fileTree.showFileTree')}
                class="ft-peek"
                use:tooltip={$_('fileTree.showFileTree')}
                onclick={handleToggleFileTree}
              >
                <ChevronRight
                  size={44}
                  class="text-fg-muted transition-opacity {peekHovered ? 'opacity-100' : 'opacity-0'}"
                />
              </button>
            </div>
          </div>
        {/if}
      {/if}

      <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden" bind:this={mainContainer}>
        {#if !appContext.app.writerMode}
          <TabBar />
        {/if}

        {#if appContext.app.writerMode}
          <div class="absolute top-2 left-0 pl-3 z-20">
            <button
              type="button"
              class="bg-bg-panel border-border-light hover:bg-bg-hover text-fg-default group flex items-center rounded-lg border px-3 py-2 shadow-lg transition-colors"
              onclick={() => (showWriterTabDropdown = !showWriterTabDropdown)}
            >
              <ChevronDown size={16} class="opacity-30 transition-opacity group-hover:opacity-100" />
            </button>
            <TabDropdown
              isOpen={showWriterTabDropdown}
              onSelect={(id) => {
                                appContext.app.activeTabId = id;
                                pushToMru(id);
                                showWriterTabDropdown = false;
                            }}
              onClose={() => (showWriterTabDropdown = false)}
            />
          </div>
        {/if}

        {#if appContext.app.activeTabId}
          <div
            class="flex w-full min-h-0 flex-1"
            class:flex-row={splitResize.isVertical}
            class:flex-col={!splitResize.isVertical}
          >
            <div
              class="writer-content relative h-full overflow-hidden"
              style:--writer-wrap={appContext.settings.writerWrapLength}
              style:flex={showPreview
                                ? `0 0 ${appContext.settings.splitPercentage * 100}%`
                                : '1 1 100%'}
            >
              {#if appContext.app.writerMode}
                <div class="absolute top-2 pr-3 z-20" style:right={appContext.settings.showMinimap ? '64px' : '16px'}>
                  <button
                    type="button"
                    aria-label={$_('tabBar.menu')}
                    use:tooltip={$_('tabBar.menu')}
                    class="bg-bg-panel border-border-light hover:bg-bg-hover text-fg-default group flex items-center rounded-lg border px-3 py-2 shadow-lg transition-colors"
                    onclick={() => (showWriterMenu = !showWriterMenu)}
                  >
                    <Menu size={16} class="opacity-30 transition-opacity group-hover:opacity-100" />
                  </button>
                  <TabBarMenu bind:showMenu={showWriterMenu} />
                </div>
              {/if}
              <Editor tabId={appContext.app.activeTabId} />
            </div>

            {#if showPreview}
              <div
                role="button"
                tabindex="0"
                aria-label={$_('common.resizeSplitView')}
                class="resize-handle"
                style:cursor={splitResize.resizeCursor}
                onmousedown={onResizeMouseDown}
                ondblclick={splitResize.resetSplit}
                onkeydown={() => {}}
              ></div>
            {/if}

            {#if showPreview}
              <div class="flex-1-height-100 min-w-0 min-h-0">
                <Preview tabId={appContext.app.activeTabId} />
              </div>
            {/if}
          </div>
        {:else}
          <div class="text-fg-muted flex flex-1 flex-col items-center justify-center select-none">
            <Logo class="mb-4 h-16 w-16 opacity-50 grayscale" />
            <p class="text-sm">{$_('app.newFileHint')}</p>
          </div>
        {/if}
      </div>
    </div>

    {#if !appContext.app.writerMode}
      <StatusBar />
    {/if}
  </div>

  <Toast />
</AppLifecycle>

<style>
.app-shell {
  position: relative;
}

.ft-peek-edge {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 2rem;
  height: 100%;
  background-color: var(--surface-2);
  border-right: 1px solid var(--border-primary);
  cursor: pointer;
  transition: background-color 150ms ease-out;
}

.ft-peek-edge-hover {
  background-color: var(--surface-hover);
}

.ft-peek-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 100%;
  border-bottom: 1px solid var(--border-primary);
  cursor: pointer;
}

.ft-peek {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex: 1;
  cursor: pointer;
}
</style>
