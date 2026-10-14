<script lang="ts">
import { ClipboardCopy, Eye, EyeOff, Space, TextWrap } from "lucide-svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import MarkdownLintStatus from "$lib/components/ui/MarkdownLintStatus.svelte";
import { translate } from "$lib/i18n";
import { togglePreferredExtension, updateTabFields } from "$lib/stores/editorStore.svelte";
import { toggleViewMode } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { formatFileSize, isMarkdownFile } from "$lib/utils/fileValidation";
import { saveSettings } from "$lib/utils/settings";
import { formatNumber } from "$lib/utils/textMetrics";

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));

// Reactive totals pulled directly from pre-calculated state in the tab
let lineEnding = $derived(activeTab?.lineEnding || "LF");
let encoding = $derived(activeTab?.encoding || "UTF-8");
let sizeBytes = $derived(activeTab?.sizeBytes || 0);
let totalWords = $derived(activeTab?.wordCount || 0);
let wordCountPending = $derived(activeTab?.wordCountPending || false);
let totalChars = $derived(activeTab?.content.length || 0);
let totalLines = $derived(activeTab?.lineCount || 1);
let widestColumn = $derived(activeTab?.widestColumn || 0);

let preferredExtension = $derived(activeTab?.preferredExtension);
let path = $derived(activeTab?.path);
let tabId = $derived(activeTab?.id);

let textOpacity = $derived(appContext.settings.statusBarOpacity / 100);
let backgroundTransparency = $derived(`${100 - appContext.settings.statusBarOpacity}%`);
let fileSizeDisplay = $derived(formatFileSize(sizeBytes));

let fileType = $derived.by(() => {
  if (!tabId) return "markdown";
  if (preferredExtension) return preferredExtension === "txt" ? "text" : "markdown";
  if (path) return isMarkdownFile(path) ? "markdown" : "text";
  return "markdown";
});

// Markdown files can only be markdown, other text files (txt, css, cpp, py, ...)
// can only be text: only unsaved documents get the text/markdown toggle.
let canToggleFileType = $derived(!!tabId && !path);

function toggleFileType() {
  if (tabId) togglePreferredExtension(tabId);
}

function toggleLineEnding() {
  if (tabId) {
    const next = lineEnding === "LF" ? "CRLF" : "LF";
    updateTabFields(tabId, { lineEnding: next });
  }
}

function toggleWhitespace() {
  appContext.settings.showWhitespace = !appContext.settings.showWhitespace;
  saveSettings();
}

function toggleWordWrap() {
  appContext.settings.wrapGuideColumn = appContext.settings.wrapGuideColumn < 0 ? 0 : -1;
  saveSettings();
}

async function copyAllStats() {
  if (!activeTab) return;

  const stats = [
    `${translate("statusBar.filePath")}: ${activeTab.path || translate("statusBar.unsaved")}`,
    `${translate("statusBar.fileSize")}: ${formatFileSize(sizeBytes)} (${sizeBytes.toLocaleString()} ${translate("statusBar.bytes")})`,
    `${translate("statusBar.totalLines")}: ${totalLines.toLocaleString()}`,
    `${translate("statusBar.widestColumn")}: ${widestColumn.toLocaleString()}`,
    `${translate("statusBar.totalCharacters")}: ${totalChars.toLocaleString()}`,
    `${translate("statusBar.totalWords")}: ${totalWords.toLocaleString()}`,
    `${translate("statusBar.lineEnding")}: ${lineEnding}`,
    `${translate("statusBar.encoding")}: ${encoding}`,
  ].join("\n");

  await navigator.clipboard.writeText(stats);
}
</script>

<footer
  class="text-ui group pointer-events-auto absolute bottom-0 left-0 right-0 z-50 flex h-8 items-center justify-between overflow-hidden border-t px-3 whitespace-nowrap select-none"
  style:--status-bar-transparency={backgroundTransparency}
  style:--status-text-opacity={textOpacity}
>
  <button
    type="button"
    class="status-text text-fg-muted hover:text-fg-default hover-surface pointer-events-auto mr-2 flex shrink-0 cursor-pointer items-center border-r pr-2 group-hover:opacity-100"
    onclick={copyAllStats}
    use:tooltip={$_("statusBar.copyAllStats")}
  >
    <ClipboardCopy size={14} />
  </button>

  <div
    role="button"
    tabindex="0"
    aria-label={$_("statusBar.options")}
    class="flex w-full flex-1 items-center justify-between"
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") e.preventDefault();
    }}
  >
    <div class="status-text text-fg-muted pointer-events-auto flex shrink-0 items-center gap-2 group-hover:opacity-100">
      <div class="flex items-center gap-1" use:tooltip={$_("statusBar.linePosition")}>
        <span class="font-mono opacity-70">{$_("statusBar.ln")}</span>
        <span class="inline-block min-w-[3ch] text-right font-mono">{formatNumber(appContext.metrics.cursorLine)}</span>
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[3ch] text-left font-mono">{formatNumber(totalLines)}</span>
      </div>
      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_("statusBar.columnPosition")}>
        <span class="font-mono opacity-70">{$_("statusBar.col")}</span>
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

      <div class="flex items-center gap-1" use:tooltip={$_("statusBar.charPosition")}>
        <span class="font-mono opacity-70">{$_("statusBar.char")}</span>
        <span class="inline-block min-w-[4ch] text-right font-mono"
          >{formatNumber(appContext.metrics.cursorOffset)}</span
        >
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[4ch] text-left font-mono">{formatNumber(totalChars)}</span>
      </div>
      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_("statusBar.wordPosition")}>
        <span class="font-mono opacity-70">{$_("statusBar.word")}</span>
        <span class="inline-block min-w-[3ch] text-right font-mono"
          >{formatNumber(appContext.metrics.currentWordIndex)}</span
        >
        <span class="opacity-30">/</span>
        <span class="inline-block min-w-[3ch] text-left font-mono {wordCountPending ? "opacity-50" : ""}"
          >{formatNumber(totalWords)}</span
        >
      </div>

      <span class="opacity-40">|</span>

      <div class="flex items-center gap-1" use:tooltip={$_("statusBar.fileSize")}>
        <span class="inline-block min-w-[7ch] text-right font-mono">{fileSizeDisplay}</span>
      </div>
    </div>

    <div class="status-text text-fg-muted pointer-events-auto flex shrink-0 items-center gap-2 group-hover:opacity-100">
      <span class="opacity-40">|</span>

      {#if fileType === "markdown"}
        <MarkdownLintStatus />
        <span class="opacity-40">|</span>
      {/if}

      <button
        type="button"
        class="hover:text-fg-default hover-surface cursor-pointer rounded px-1 transition-colors"
        onclick={toggleLineEnding}
        use:tooltip={$_("statusBar.toggleLineEnding")}
      >
        {lineEnding}
      </button>

      <span class="cursor-default opacity-70" use:tooltip={$_("statusBar.fileEncoding")}>
        {encoding}
      </span>
      <span class="opacity-40">|</span>

      <button
        type="button"
        class="hover:text-fg-default hover-surface flex cursor-pointer items-center rounded px-1 transition-colors {appContext
          .settings.showWhitespace
          ? "text-accent-secondary"
          : "text-inherit"}"
        onclick={toggleWhitespace}
        use:tooltip={$_("statusBar.toggleWhitespace")}
      >
        <Space size={14} />
      </button>

      <button
        type="button"
        class="hover:text-fg-default hover-surface flex cursor-pointer items-center gap-1 rounded px-1 transition-colors {appContext
          .settings.wrapGuideColumn >= 0
          ? "text-accent-secondary"
          : "text-inherit"}"
        onclick={toggleWordWrap}
        use:tooltip={$_("statusBar.toggleWordWrap")}
      >
        <TextWrap size={14} />
      </button>

      {#if fileType === "markdown"}
        <button
          type="button"
          class="hover:text-fg-default hover-surface flex cursor-pointer items-center rounded px-1 transition-colors {appContext
            .settings.viewMode === "rendered"
            ? "text-accent-secondary"
            : "text-inherit"}"
          onclick={toggleViewMode}
          use:tooltip={appContext.settings.viewMode === "rendered"
            ? $_("statusBar.renderedMode")
            : $_("statusBar.rawMode")}
        >
          {#if appContext.settings.viewMode === "rendered"}
            <Eye size={14} />
          {:else}
            <EyeOff size={14} />
          {/if}
        </button>
      {/if}

      {#if canToggleFileType}
        <button
          type="button"
          class="text-accent-secondary hover:text-accent-secondary hover-surface flex cursor-pointer items-center rounded px-1 transition-colors"
          onclick={toggleFileType}
          use:tooltip={$_("statusBar.toggleFileType")}
        >
          <span class="w-5 text-center font-bold">{fileType === "markdown" ? "M" : "T"}</span>
        </button>
      {:else}
        <span class="flex cursor-default items-center px-1 opacity-70" use:tooltip={$_("statusBar.fileType")}>
          <span class="w-5 text-center font-bold">{fileType === "markdown" ? "M" : "T"}</span>
        </span>
      {/if}
    </div>
  </div>
</footer>

<style>
/* Background fade reads the transparency from the footer's inline custom
   property. Keeping the value in CSS rather than inline lets the hover rule win
   on specificity, so no !important is needed.
   No background transition: a WebKitGTK fade over the editor flickers on hover
   entry/exit (same finding as the TabButton close button). */
footer {
  background-color: color-mix(in srgb, var(--surface-2), transparent var(--status-bar-transparency));
}

footer:hover {
  background-color: var(--surface-2);
}

/* Fades the stats; `group-hover:opacity-100` (higher specificity) restores full alpha. */
.status-text {
  opacity: var(--status-text-opacity);
}
</style>
