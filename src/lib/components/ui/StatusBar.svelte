<script lang="ts">
import { ClipboardCopy, Pencil, TextWrap } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import MarkdownLintStatus from '$lib/components/ui/MarkdownLintStatus.svelte';
import { translate } from '$lib/i18n';
import { togglePreferredExtension, updateTabFields } from '$lib/stores/editorStore.svelte';
import { toggleViewMode } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { formatFileSize, isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';
import { formatNumber } from '$lib/utils/textMetrics';

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));

// Reactive totals pulled directly from pre-calculated state in the tab
let lineEnding = $derived(activeTab?.lineEnding || 'LF');
let encoding = $derived(activeTab?.encoding || 'UTF-8');
let sizeBytes = $derived(activeTab?.sizeBytes || 0);
let totalWords = $derived(activeTab?.wordCount || 0);
let wordCountPending = $derived(activeTab?.wordCountPending || false);
let totalChars = $derived(activeTab?.content.length || 0);
let totalLines = $derived(activeTab?.lineCount || 1);
let widestColumn = $derived(activeTab?.widestColumn || 0);

let preferredExtension = $derived(activeTab?.preferredExtension);
let path = $derived(activeTab?.path);
let tabId = $derived(activeTab?.id);

let textOpacity = $derived(1 - appContext.settings.statusBarTransparency / 100);
let fileSizeDisplay = $derived(formatFileSize(sizeBytes));

let fileType = $derived.by(() => {
  if (!tabId) return 'markdown';
  if (preferredExtension) return preferredExtension === 'txt' ? 'text' : 'markdown';
  if (path) return isMarkdownFile(path) ? 'markdown' : 'text';
  return 'markdown';
});

// Markdown files can only be markdown, other text files (txt, css, cpp, py, ...)
// can only be text: only unsaved documents get the text/markdown toggle.
let canToggleFileType = $derived(!!tabId && !path);

// Context Menu State
let showMenu = $state(false);
let menuX = $state(0);
let menuY = $state(0);

function toggleFileType() {
  if (tabId) togglePreferredExtension(tabId);
}

function toggleLineEnding() {
  if (tabId) {
    const next = lineEnding === 'LF' ? 'CRLF' : 'LF';
    updateTabFields(tabId, { lineEnding: next });
  }
}

function toggleWordWrap() {
  appContext.settings.wrapGuideColumn = appContext.settings.wrapGuideColumn < 0 ? 0 : -1;
  saveSettings();
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  menuX = e.clientX;
  menuY = e.clientY;
  showMenu = true;
}

async function copyAllStats() {
  if (!activeTab) return;

  const stats = [
    `${translate('statusBar.filePath')}: ${activeTab.path || translate('statusBar.unsaved')}`,
    `${translate('statusBar.fileSize')}: ${formatFileSize(sizeBytes)} (${sizeBytes.toLocaleString()} ${translate('statusBar.bytes')})`,
    `${translate('statusBar.totalLines')}: ${totalLines.toLocaleString()}`,
    `${translate('statusBar.widestColumn')}: ${widestColumn.toLocaleString()}`,
    `${translate('statusBar.totalCharacters')}: ${totalChars.toLocaleString()}`,
    `${translate('statusBar.totalWords')}: ${totalWords.toLocaleString()}`,
    `${translate('statusBar.lineEnding')}: ${lineEnding}`,
    `${translate('statusBar.encoding')}: ${encoding}`,
  ].join('\n');

  await navigator.clipboard.writeText(stats);
  showMenu = false;
}
</script>

<footer
  class="text-ui-sm bg-bg-panel bg-border-main hover:bg-bg-panel! group pointer-events-auto z-50 flex shrink-0 items-center justify-between overflow-hidden border-t px-3 py-1.5 whitespace-nowrap transition-colors duration-200 select-none"
  style:background-color="color-mix(in srgb, var(--surface-2), transparent {appContext.settings.statusBarTransparency}%)"
>
  <div
    role="button"
    tabindex="0"
    aria-label={$_('statusBar.options')}
    class="flex w-full items-center justify-between"
    oncontextmenu={handleContextMenu}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
  >
    <div
      class="text-fg-muted pointer-events-auto flex shrink-0 items-center gap-2 transition-opacity duration-200 group-hover:opacity-100"
      style:opacity={textOpacity}
    >
      <div class="flex items-center gap-1" use:tooltip={$_('statusBar.linePosition')}>
        <span class="font-mono opacity-70">{$_('statusBar.ln')}</span>
        <span class="inline-block min-w-[3ch] text-right font-mono">{formatNumber(appContext.metrics.cursorLine)}</span>
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[3ch] text-left font-mono">{formatNumber(totalLines)}</span>
      </div>
      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_('statusBar.columnPosition')}>
        <span class="font-mono opacity-70">{$_('statusBar.col')}</span>
        <span class="inline-block min-w-[3ch] text-right font-mono">{formatNumber(appContext.metrics.cursorCol)}</span>
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[3ch] text-left font-mono">
          {formatNumber(
                    Math.max(
                        appContext.metrics.currentLineLength,
                        appContext.metrics.cursorCol > appContext.metrics.currentLineLength
                            ? appContext.metrics.cursorCol
                            : appContext.metrics.currentLineLength,
                    ),
                )}
        </span>
      </div>
      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_('statusBar.charPosition')}>
        <span class="font-mono opacity-70">{$_('statusBar.char')}</span>
        <span class="inline-block min-w-[4ch] text-right font-mono"
          >{formatNumber(appContext.metrics.cursorOffset)}</span
        >
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[4ch] text-left font-mono">{formatNumber(totalChars)}</span>
      </div>
      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_('statusBar.wordPosition')}>
        <span class="font-mono opacity-70">{$_('statusBar.word')}</span>
        <span class="inline-block min-w-[3ch] text-right font-mono"
          >{formatNumber(appContext.metrics.currentWordIndex)}</span
        >
        <span class="opacity-30">/</span>
        <span
          class="inline-block min-w-[3ch] text-left font-mono {wordCountPending
                    ? 'opacity-50'
                    : ''}"
          >{formatNumber(totalWords)}</span
        >
      </div>

      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_('statusBar.fileSize')}>
        <span class="inline-block min-w-[7ch] text-right font-mono">{fileSizeDisplay}</span>
      </div>
    </div>

    <div
      class="text-fg-muted pointer-events-auto flex shrink-0 items-center gap-2 transition-opacity duration-200 group-hover:opacity-100"
      style:opacity={textOpacity}
    >
      <span class="opacity-40">|</span>

      {#if fileType === 'markdown'}
        <MarkdownLintStatus />
        <span class="opacity-40">|</span>
      {/if}

      <button
        type="button"
        class="hover:text-fg-default hover-surface cursor-pointer rounded px-1 transition-colors"
        onclick={toggleLineEnding}
        use:tooltip={$_('statusBar.toggleLineEnding')}
      >
        {lineEnding}
      </button>

      <span class="cursor-default opacity-70" use:tooltip={$_('statusBar.fileEncoding')}>
        {encoding}
      </span>
      <span class="opacity-40">|</span>

      <button
        type="button"
        class="hover:text-fg-default hover-surface flex cursor-pointer items-center gap-1 rounded px-1 transition-colors {appContext
                .settings.wrapGuideColumn >= 0
                ? 'text-accent-secondary'
                : 'text-inherit'}"
        onclick={toggleWordWrap}
        use:tooltip={$_('statusBar.toggleWordWrap')}
      >
        <TextWrap size={14} />
      </button>

      {#if fileType === 'markdown'}
        <button
          type="button"
          class="hover:text-fg-default hover-surface flex cursor-pointer items-center rounded px-1 transition-colors {appContext
                    .settings.viewMode === 'rendered'
                    ? 'text-accent-secondary'
                    : 'text-inherit'}"
          onclick={toggleViewMode}
          use:tooltip={appContext.settings.viewMode === 'rendered' ? $_('statusBar.renderedMode') : $_('statusBar.rawMode')}
        >
          <Pencil size={14} />
        </button>
      {:else}
        <span class="flex cursor-default items-center px-1 opacity-70">
          <Pencil size={14} />
        </span>
      {/if}

      {#if canToggleFileType}
        <button
          type="button"
          class="text-accent-primary hover:text-accent-secondary hover-surface flex cursor-pointer items-center rounded px-1 transition-colors"
          onclick={toggleFileType}
          use:tooltip={$_('statusBar.toggleFileType')}
        >
          <span class="w-5 text-center font-bold">{fileType === 'markdown' ? 'M' : 'T'}</span>
        </button>
      {:else}
        <span class="flex cursor-default items-center px-1 opacity-70" use:tooltip={$_('statusBar.fileType')}>
          <span class="w-5 text-center font-bold">{fileType === 'markdown' ? 'M' : 'T'}</span>
        </span>
      {/if}
    </div>
  </div>
</footer>

{#if showMenu}
  <ContextMenu x={menuX} y={menuY} onClose={() => (showMenu = false)}>
    <button
      type="button"
      class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
      onclick={copyAllStats}
    >
      <ClipboardCopy size={14} class="opacity-70" />
      <span>{$_('statusBar.copyAllStats')}</span>
    </button>
  </ContextMenu>
{/if}
