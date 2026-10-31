<script lang="ts">
import ChevronDown from "lucide-svelte/icons/chevron-down";
import ChevronRight from "lucide-svelte/icons/chevron-right";
import FolderTree from "lucide-svelte/icons/folder-tree";
import Menu from "lucide-svelte/icons/menu";
import X from "lucide-svelte/icons/x";
import { onDestroy } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import AppLifecycle from "$lib/components/app/AppLifecycle.svelte";
import Editor from "$lib/components/editor/Editor.svelte";
import { createSplitResize } from "$lib/components/editor/logic/splitResize.svelte";
import FileTree from "$lib/components/filetree/FileTree.svelte";
import Preview from "$lib/components/preview/Preview.svelte";
import Logo from "$lib/components/ui/Logo.svelte";
import StatusBar from "$lib/components/ui/StatusBar.svelte";
import TabBar from "$lib/components/ui/TabBar.svelte";
import TabBarMenu from "$lib/components/ui/TabBarMenu.svelte";
import TabDropdown from "$lib/components/ui/TabDropdown.svelte";
import Toast from "$lib/components/ui/Toast.svelte";
import { initializeTabFileState } from "$lib/services/tabFileStateInit";
import { loadTabContentLazy } from "$lib/services/tabLoadStateMachine";
import { pushToMru } from "$lib/stores/editorStore.svelte";
import { focusPane, isSplitPaneActive, toggleSplitPane } from "$lib/stores/paneStore.svelte";
import { toggleFileTree } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import { getEditorInstance } from "$lib/utils/editorCommands";
import { isMarkdownTab } from "$lib/utils/fileValidation";
import { saveSettings } from "$lib/utils/settings";

const splitResize = createSplitResize();
const paneResize = createSplitResize({
  getValue: () => appContext.settings.paneSplitPercentage,
  setValue: (ratio) => {
    appContext.settings.paneSplitPercentage = ratio;
  },
  getIsVertical: () => true,
});

let mainContainer = $state<HTMLDivElement>();

function handleToggleFileTree() {
  toggleFileTree();
  saveSettings();
}

let primaryTabId = $derived(appContext.app.paneTabs[0] ?? appContext.app.activeTabId ?? "");
let secondaryTabId = $derived(appContext.app.paneTabs[1] ?? "");
let splitPaneActive = $derived(
  isSplitPaneActive() && !appContext.app.writerMode && primaryTabId !== "" && secondaryTabId !== "",
);

// Pane sync is suspended while a background tab is saved, so the visible
// document must follow the pane, not activeTabId.
let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === primaryTabId));

let isMarkdown = $derived(isMarkdownTab(activeTab));

let showPreview = $derived(appContext.settings.splitView && isMarkdown && !splitPaneActive);
let showWriterTabDropdown = $state(false);
let showWriterMenu = $state(false);
let peekHovered = $state(false);

// activeTabId is the focused document for every command and status read, so
// keep the focused pane's slot in step with it. Pointing activeTabId at the
// other pane's tab focuses that pane instead of showing a file twice.
$effect(() => {
  const app = appContext.app;
  if (app.paneSyncSuspended) return;

  if (app.paneTabs[1] === null) {
    if (app.activePane !== 0) app.activePane = 0;
    if (app.paneTabs[0] !== app.activeTabId) app.paneTabs[0] = app.activeTabId;
    return;
  }

  const id = app.activeTabId;
  const other = app.activePane === 0 ? 1 : 0;
  if (id && app.paneTabs[other] === id) {
    app.activePane = other;
  } else if (app.paneTabs[app.activePane] !== id) {
    app.paneTabs[app.activePane] = id;
  }
});

// A background pane never becomes the active tab, so its lazy session content
// would otherwise stay unloaded.
$effect(() => {
  for (const id of appContext.app.paneTabs) {
    const tab = id ? appContext.editor.tabs.find((t) => t.id === id) : undefined;
    if (tab && !tab.contentLoaded) {
      void loadTabContentLazy(tab.id).then((fromDisk) => initializeTabFileState(tab, fromDisk));
    }
  }
});

function paneTitle(id: string | null): string {
  if (!id) return "";
  const tab = appContext.editor.tabs.find((t) => t.id === id);
  return tab?.title || tab?.path || "";
}

function activatePane(index: 0 | 1) {
  focusPane(index);
  const id = appContext.app.paneTabs[index];
  if (id) getEditorInstance(id)?.focus();
}

// JS-driven so the native cursor-left cleanup can clear it; CSS-only :hover
// sticks when WebKitGTK skips mouseleave on a fast window exit. Lives here, not
// in the conditionally-rendered edge, so it survives the edge unmounting while
// hovered (clicking the edge to re-open the tree never fires mouseleave).
$effect(() => {
  if (appContext.settings.fileTreeVisible) {
    peekHovered = false;
  }
});

onDestroy(() => {
  paneResize.cleanup();
  splitResize.cleanup();
});

function onResizePointerDown(e: PointerEvent) {
  if (mainContainer) splitResize.registerContainer(mainContainer);
  splitResize.startResize(e);
}

function onPaneResizePointerDown(e: PointerEvent) {
  if (mainContainer) paneResize.registerContainer(mainContainer);
  paneResize.startResize(e);
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
              aria-label={$_("fileTree.showFileTree")}
              class="ft-peek-toolbar"
              use:tooltip={$_("fileTree.showFileTree")}
              onclick={handleToggleFileTree}
            >
              <FolderTree size={14} class="shrink-0" />
            </button>
            <div class="flex min-h-0 flex-1 items-center justify-center">
              <button
                type="button"
                aria-label={$_("fileTree.showFileTree")}
                class="ft-peek"
                use:tooltip={$_("fileTree.showFileTree")}
                onclick={handleToggleFileTree}
              >
                <ChevronRight size={44} />
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
              class="btn-base btn-float group px-3 py-2"
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

        {#if primaryTabId}
          {#if splitPaneActive && primaryTabId && secondaryTabId}
            <div class="flex w-full min-h-0 flex-1 flex-row">
              <div
                role="group"
                class="flex min-h-0 min-w-0 flex-col"
                style:flex={`0 0 ${appContext.settings.paneSplitPercentage * 100}%`}
                onfocusin={() => focusPane(0)}
              >
                <div
                  class="bg-bg-panel border-border-primary text-ui-sm flex h-8 shrink-0 items-center gap-2 border-b px-3"
                >
                  <button
                    type="button"
                    class="min-w-0 flex-1 truncate text-left"
                    class:text-fg-default={appContext.app.activePane === 0}
                    class:text-fg-muted={appContext.app.activePane !== 0}
                    onclick={() => activatePane(0)}
                  >
                    {paneTitle(primaryTabId)}
                  </button>
                </div>
                <div class="min-h-0 min-w-0 flex-1">
                  <Editor tabId={primaryTabId} />
                </div>
              </div>

              <!-- A focusable separator is the ARIA window-splitter pattern. -->
              <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
              <div
                role="separator"
                tabindex="0"
                aria-orientation="vertical"
                aria-label={$_("common.resizeSplitView")}
                aria-valuemin={Math.round(CONFIG.SPLIT.MIN_PERCENTAGE * 100)}
                aria-valuemax={Math.round(CONFIG.SPLIT.MAX_PERCENTAGE * 100)}
                aria-valuenow={Math.round(appContext.settings.paneSplitPercentage * 100)}
                class="resize-handle"
                style:cursor="col-resize"
                onpointerdown={onPaneResizePointerDown}
                ondblclick={paneResize.resetSplit}
                onkeydown={paneResize.handleKeyDown}
              ></div>

              <div role="group" class="flex min-h-0 min-w-0 flex-1 flex-col" onfocusin={() => focusPane(1)}>
                <div
                  class="bg-bg-panel border-border-primary text-ui-sm flex h-8 shrink-0 items-center gap-2 border-b px-3"
                >
                  <button
                    type="button"
                    class="min-w-0 flex-1 truncate text-left"
                    class:text-fg-default={appContext.app.activePane === 1}
                    class:text-fg-muted={appContext.app.activePane !== 1}
                    onclick={() => activatePane(1)}
                  >
                    {paneTitle(secondaryTabId)}
                  </button>
                  <button
                    type="button"
                    class="ml-auto shrink-0 p-0.5 opacity-50 transition-opacity hover:opacity-100"
                    aria-label={$_("common.closeSplitPane")}
                    use:tooltip={$_("common.closeSplitPane")}
                    onclick={() => void toggleSplitPane()}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div class="min-h-0 min-w-0 flex-1">
                  <Editor tabId={secondaryTabId} />
                </div>
              </div>
            </div>
          {:else}
            <div
              class="flex w-full min-h-0 flex-1"
              class:flex-row={splitResize.isVertical}
              class:flex-col={!splitResize.isVertical}
            >
              <div
                class="writer-content relative h-full overflow-hidden"
                style:--writer-wrap={appContext.settings.writerWrapLength}
                style:flex={showPreview ? `0 0 ${appContext.settings.splitPercentage * 100}%` : "1 1 100%"}
              >
                {#if appContext.app.writerMode}
                  <div
                    class="absolute top-2 pr-3 z-20"
                    style:right={appContext.settings.showMinimap
                      ? "var(--minimap-width)"
                      : "var(--scrollbar-track-width)"}
                  >
                    <button
                      type="button"
                      aria-label={$_("tabBar.menu")}
                      use:tooltip={$_("tabBar.menu")}
                      class="btn-base btn-float group px-3 py-2"
                      onclick={() => (showWriterMenu = !showWriterMenu)}
                    >
                      <Menu size={16} class="opacity-30 transition-opacity group-hover:opacity-100" />
                    </button>
                    <TabBarMenu bind:showMenu={showWriterMenu} />
                  </div>
                {/if}
                <Editor tabId={primaryTabId} />
              </div>

              {#if showPreview}
                <!-- A focusable separator is the ARIA window-splitter pattern. -->
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
                <div
                  role="separator"
                  tabindex="0"
                  aria-orientation={splitResize.isVertical ? "vertical" : "horizontal"}
                  aria-label={$_("common.resizeSplitView")}
                  aria-valuemin={Math.round(CONFIG.SPLIT.MIN_PERCENTAGE * 100)}
                  aria-valuemax={Math.round(CONFIG.SPLIT.MAX_PERCENTAGE * 100)}
                  aria-valuenow={Math.round(appContext.settings.splitPercentage * 100)}
                  class="resize-handle"
                  style:cursor={splitResize.resizeCursor}
                  onpointerdown={onResizePointerDown}
                  ondblclick={splitResize.resetSplit}
                  onkeydown={splitResize.handleKeyDown}
                ></div>
              {/if}

              {#if showPreview}
                <div class="flex-1-height-100 min-w-0 min-h-0">
                  <Preview tabId={primaryTabId} />
                </div>
              {/if}
            </div>
          {/if}
        {:else}
          <div class="text-fg-muted flex flex-1 flex-col items-center justify-center select-none">
            <Logo class="mb-4 h-16 w-16 opacity-50 grayscale" />
            <p class="text-ui">{$_("app.newFileHint")}</p>
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
  overflow: hidden;
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
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-primary);
  cursor: pointer;
  transition: color 150ms ease-out;
}

.ft-peek-edge-hover .ft-peek-toolbar {
  color: var(--text-primary);
}

.ft-peek {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex: 1;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0.5;
  transition:
    color 150ms ease-out,
    opacity 150ms ease-out;
}

.ft-peek-edge-hover .ft-peek {
  color: var(--text-primary);
  opacity: 1;
}
</style>
