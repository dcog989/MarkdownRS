<script lang="ts">
import Bookmark from "lucide-svelte/icons/bookmark";
import CircleAlert from "lucide-svelte/icons/circle-alert";
import FileText from "lucide-svelte/icons/file-text";
import Pencil from "lucide-svelte/icons/pencil";
import PencilLine from "lucide-svelte/icons/pencil-line";
import Pin from "lucide-svelte/icons/pin";
import SquarePen from "lucide-svelte/icons/square-pen";
import X from "lucide-svelte/icons/x";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import { isBookmarked } from "$lib/stores/bookmarkStore.svelte";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { formatFileSize } from "$lib/utils/fileValidation";

interface Props {
  tab: EditorTab;
  isActive: boolean;
  onclick?: (id: string) => void;
  onclose?: (e: MouseEvent | KeyboardEvent, tabId: string) => void;
  oncontextmenu?: (e: MouseEvent, tabId: string) => void;
}

let { tab, isActive, onclick, onclose, oncontextmenu }: Props = $props();

let isFileMissing = $derived(tab.fileCheckFailed === true);
let isCollapsed = $derived(appContext.settings.collapsePinnedTabs && tab.isPinned);

let tooltipContent = $derived.by(() => {
  const parts: string[] = [];
  const sizeStr = formatFileSize(tab.sizeBytes || 0);
  const formattedTime = tab.formattedTimestamp || "";

  const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

  if (tab.fileCheckFailed) {
    parts.push($_("tabButton.missingFile"));
    if (tab.path) parts.push(tab.path);
  } else {
    parts.push(tab.path || $_("tabButton.unsaved"));
  }
  parts.push(bottomLine);

  if (isCollapsed) {
    return `${tab.customTitle || tab.title}\n${parts.join("\n")}`;
  }

  return parts.join("\n");
});
</script>

<div
  role="button"
  tabindex="0"
  data-active={isActive}
  data-tab-id={tab.id}
  class="group text-ui relative flex h-8 min-w-0 cursor-default items-center gap-2 text-left outline-none select-none"
  class:bg-editor-active={isActive}
  class:bg-bg-panel={!isActive}
  class:hover:bg-bg-hover={!isActive}
  class:text-fg-default={isActive}
  class:text-fg-muted={!isActive}
  class:border-r={true}
  class:justify-center={isCollapsed}
  class:px-3={!isCollapsed}
  class:rounded-t-md={true}
  style:flex="1 1 auto"
  onclick={() => onclick?.(tab.id)}
  oncontextmenu={(e) => {
    e.preventDefault();
    oncontextmenu?.(e, tab.id);
  }}
  onkeydown={(e) => e.key === "Enter" && onclick?.(tab.id)}
  use:tooltip={isCollapsed ? tooltipContent : null}
>
  {#if isFileMissing}
    <CircleAlert size={14} class="text-danger shrink-0" />
  {:else if !tab.path}
    {#if tab.content.length > 0}
      <PencilLine
        size={14}
        class="shrink-0 {isActive && tab.isDirty
          ? "text-dirty-active"
          : isActive
            ? "text-fg-inverse"
            : "text-fg-muted"}"
      />
    {:else}
      <Pencil size={14} class="shrink-0 {isActive ? "text-fg-inverse" : "text-fg-muted"}" />
    {/if}
  {:else if tab.isDirty}
    <SquarePen
      size={14}
      class="shrink-0 {isActive && tab.isDirty
        ? "text-dirty-active"
        : isActive
          ? "text-fg-inverse"
          : "text-accent-secondary"}"
    />
  {:else if tab.path && isBookmarked(tab.path)}
    <Bookmark size={14} class="shrink-0 {isActive ? "text-fg-inverse" : "text-fg-muted"}" />
  {:else}
    <FileText size={14} class="shrink-0 {isActive ? "text-fg-inverse" : "text-fg-muted"}" />
  {/if}

  {#if !isCollapsed}
    <div class="flex-1 truncate" use:tooltip={tooltipContent}>
      <span class="pointer-events-none truncate">{tab.customTitle || tab.title}</span>
    </div>

    {#if tab.isPinned}
      <Pin size={14} class="shrink-0 {isActive ? "text-accent-secondary" : "text-fg-muted"}" />
    {:else}
      <div
        class="close-btn-wrapper absolute top-0 right-0 bottom-0 z-10 flex w-8 items-center justify-center group-hover:opacity-100"
        style:top={isActive ? "2px" : "0"}
        style:background={`linear-gradient(to right, transparent 0%, ${isActive ? "var(--editor-bg)" : "var(--surface-hover)"} 40%, ${isActive ? "var(--editor-bg)" : "var(--surface-hover)"} 100%)`}
      >
        <button
          type="button"
          aria-label={$_("tabButton.closeTab", { values: { title: tab.title } })}
          class="btn-icon btn-icon--danger"
          onclick={(e) => {
            e.stopPropagation();
            onclose?.(e, tab.id);
          }}
          onkeydown={(e) => e.key === "Enter" && onclose?.(e, tab.id)}
          use:tooltip={$_("tabButton.closeTab", { values: { title: tab.title } })}
        >
          <X size={14} class="transition-colors" />
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
/* No transition: a WebKitGTK opacity animation on this overlay flickers the
     close icon and the text it covers, on entry and exit alike. The 1% floor
     and pinned layer below predate that finding and did not fix it alone. */
.close-btn-wrapper {
  opacity: 0.01;
  will-change: opacity;
  transform: translateZ(0);
}
</style>
