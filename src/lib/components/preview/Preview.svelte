<script lang="ts">
import { FileText, FlipHorizontal, FlipVertical, X } from "lucide-svelte";
import { onDestroy, tick } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
import Logo from "$lib/components/ui/Logo.svelte";
import { getTransientState, tabsById, updateTransientState } from "$lib/stores/editorStore.svelte";
import { toggleOrientation, toggleSplitView } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import { navigateToPath } from "$lib/utils/fileSystem";
import { isMarkdownFile } from "$lib/utils/fileValidation";
import { renderMermaidDiagrams } from "$lib/utils/mermaidRenderer";
import { PreviewRenderer } from "$lib/utils/previewRenderer.svelte";
import { scrollSync } from "$lib/utils/scrollSync.svelte";
import { highlightCodeBlocks } from "$lib/utils/syntaxHighlightRenderer";

let { tabId } = $props<{ tabId: string }>();
let container = $state<HTMLDivElement>();
let previewHtmlWasEmpty = true;

const renderer = new PreviewRenderer({
  onContentRendered: () => {
    if (!container) return;
    scrollSync.registerPreview(container);
    scrollSync.markMapDirty();
    // Rebuild the line map after the Svelte flush so it reflects the new
    // tab's DOM (a synchronous build here would still read the previous
    // tab's rendered content, producing a mixed/stale map).
    void tick().then(() => scrollSync.updateMap());
  },
  onRenderSettled: () => {
    scrollSync.endTabSwitch(CONFIG.PERFORMANCE.TAB_SWITCH_SCROLL_SUPPRESS_MS);
  },
});

let activeTab = $derived(tabsById().get(tabId));

let tabPath = $derived(activeTab?.path);
let tabContent = $derived(activeTab?.content || "");

let isMarkdown = $derived(tabPath ? isMarkdownFile(tabPath) : true);
let flavor = $derived(appContext.settings.markdownFlavor);

$effect(() => {
  // Capture the outgoing tab's preview position before its content is reset,
  // using the still-rendered html so placeholder/clamp resets are never saved.
  const previousTabId = renderer.lastTabId;
  const isSwitching = previousTabId !== "" && previousTabId !== tabId;
  if (isSwitching) {
    scrollSync.beginTabSwitch();
    if (container && renderer.htmlContent) {
      updateTransientState(previousTabId, { previewScrollTop: container.scrollTop });
    }
  }
  renderer.onTabSwitch(tabId);
});

$effect(() => {
  const content = tabContent;
  const currentFlavor = flavor;

  if (!isMarkdown) {
    // No preview is rendered for non-markdown tabs, so nothing will call
    // endTabSwitch; resume syncing now that the switch has settled.
    scrollSync.endTabSwitch(0);
    return;
  }
  if (content === renderer.lastRendered && renderer.htmlContent) return;

  return renderer.scheduleRender(content, currentFlavor, tabPath);
});

// Restore the preview's saved scroll position only when htmlContent goes from
// empty to populated — i.e. a fresh render after a tab switch (onTabSwitch
// resets htmlContent to ''). Same-tab re-renders keep the browser's pixel
// offset and must not be touched.
$effect(() => {
  const html = renderer.htmlContent;
  const isFreshRender = previewHtmlWasEmpty && !!html;
  previewHtmlWasEmpty = !html;
  if (!isFreshRender || !container) return;
  const saved = getTransientState(tabId)?.previewScrollTop ?? 0;
  if (saved <= 0) return;
  void container.scrollHeight; // force layout so the scroll assignment sticks
  container.scrollTop = saved;
});

onDestroy(() => {
  renderer.cleanup();
});

function injectHtml(node: HTMLElement, content: string) {
  node.innerHTML = content;
  void renderMermaidDiagrams(node);
  void highlightCodeBlocks(node);

  return {
    update(newContent: string) {
      node.innerHTML = newContent;
      void renderMermaidDiagrams(node);
      void highlightCodeBlocks(node);
    },
  };
}
</script>

<div class="bg-bg-preview group/preview relative h-full w-full border-l">
  <div class="absolute top-2 right-2 z-10 flex gap-1">
    <button
      type="button"
      class="bg-bg-panel text-fg-default hover-surface rounded border p-2 shadow-lg transition-all duration-200 opacity-30 hover:opacity-100 group-hover/preview:opacity-100"
      onclick={() => toggleOrientation()}
      use:tooltip={appContext.settings.splitOrientation === 'vertical'
                ? $_('preview.switchHorizontal')
                : $_('preview.switchVertical')}
    >
      {#if appContext.settings.splitOrientation === 'vertical'}
        <FlipVertical size={16} />
      {:else}
        <FlipHorizontal size={16} />
      {/if}
    </button>
    <button
      type="button"
      class="bg-bg-panel text-fg-default hover-surface rounded border p-2 shadow-lg transition-all duration-200 opacity-30 hover:opacity-100 group-hover/preview:opacity-100"
      onclick={() => toggleSplitView()}
      use:tooltip={$_('preview.closePreview')}
    >
      <X size={16} />
    </button>
  </div>

  <div
    bind:this={container}
    id="active-preview-container"
    onclick={(e) => {
            const a = (e.target as HTMLElement).closest('a');
            if (a) {
                e.preventDefault();
                const href = a.getAttribute('href') || '';
                if (href.startsWith('#')) {
                    container?.querySelector(href)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                    return;
                }
                navigateToPath(href);
            }
        }}
    role="none"
    class="preview-root no-scrollbar bg-bg-preview relative z-0 h-full w-full max-w-none overflow-y-auto p-8 pb-40"
    style="font-family: {appContext.settings.previewFontFamily}; font-size: {appContext.settings
            .previewFontSize}px;"
    spellcheck="false"
  >
    {#if !isMarkdown}
      <div
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none"
      >
        <FileText size={64} class="mb-4" />
        <p>{$_('preview.notAvailable')}</p>
      </div>
    {:else if renderer.showSpinner || (renderer.isRendering && !renderer.htmlContent)}
      <div class="absolute inset-0 flex items-center justify-center opacity-50">
        <div class="flex flex-col items-center gap-2">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500"></div>
          <div class="text-sm">{$_('preview.rendering')}</div>
        </div>
      </div>
    {:else if renderer.renderError}
      <div class="absolute inset-0 flex flex-col items-center justify-center px-8 opacity-60">
        <div class="text-danger-text text-center text-sm">{renderer.renderError}</div>
      </div>
    {:else if !renderer.htmlContent}
      <div class="absolute inset-0 flex flex-col items-center justify-center opacity-20">
        <Logo class="mb-4 h-24 w-24 grayscale" />
        <h1 class="text-3xl font-bold">{$_('app.name')}</h1>
      </div>
    {:else}
      <div class="display-contents" use:injectHtml={renderer.htmlContent}></div>
    {/if}
  </div>

  {#if container && isMarkdown}
    <CustomScrollbar viewport={container} />
  {/if}
</div>
