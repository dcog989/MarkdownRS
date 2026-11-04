<script lang="ts">
import { closeSearchPanel, findNext, findPrevious, openSearchPanel, replaceAll, replaceNext } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import ArrowRightLeft from "lucide-svelte/icons/arrow-right-left";
import CaseSensitive from "lucide-svelte/icons/case-sensitive";
import ChevronDown from "lucide-svelte/icons/chevron-down";
import ChevronUp from "lucide-svelte/icons/chevron-up";
import File from "lucide-svelte/icons/file";
import Files from "lucide-svelte/icons/files";
import Regex from "lucide-svelte/icons/regex";
import Replace from "lucide-svelte/icons/replace";
import ReplaceAll from "lucide-svelte/icons/replace-all";
import Search from "lucide-svelte/icons/search";
import WholeWord from "lucide-svelte/icons/whole-word";
import X from "lucide-svelte/icons/x";
import { onMount, tick, untrack } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Input from "$lib/components/ui/Input.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { CONFIG } from "$lib/utils/config";
import {
  clearSearch,
  replaceAllInTabs,
  searchAllTabs,
  searchState,
  selectNearestMatch,
  updateSearchEditor,
} from "$lib/utils/searchManager.svelte";
import { isModalOpen } from "$lib/utils/shortcuts";
import { debounce } from "$lib/utils/timing";

let {
  isOpen = $bindable(false),
  barHeight = $bindable(0),
  cmView,
}: {
  isOpen?: boolean;
  barHeight?: number;
  cmView: (EditorView & { flushPendingContent?: () => void }) | undefined;
} = $props();

let searchScope = $state<"current" | "all">("current");
let isReplaceMode = $state(appContext.interface.isReplaceMode);
let searchInputRef = $state<HTMLInputElement>();
let panelRef = $state<HTMLDivElement>();
let wasOpen = false;
let isMouseOver = $state(false);
let panelOpacity = $derived(isMouseOver ? 1 : appContext.settings.findPanelOpacity / 100);
let inputBackground = $derived(`color-mix(in srgb, var(--surface-input) ${panelOpacity * 100}%, transparent)`);
let hasMatches = $derived(
  searchScope === "current" ? searchState.currentMatches > 0 : searchState.allTabsResults.size > 0,
);

export function focusInput() {
  if (searchInputRef) {
    searchInputRef.focus();
    searchInputRef.select();
  }
}

export function setReplaceMode(enable: boolean) {
  isReplaceMode = enable;
}

$effect(() => {
  const currentlyOpen = isOpen;

  if (currentlyOpen && !wasOpen) {
    if (cmView) openSearchPanel(cmView);
    wasOpen = true;

    // Prefill with selected text if available
    untrack(() => {
      if (cmView) {
        const selection = cmView.state.selection.main;
        if (selection.from !== selection.to) {
          // Text is selected, use it as the search term
          const selectedText = cmView.state.doc.sliceString(selection.from, selection.to);
          if (selectedText) {
            searchState.findText = selectedText;
          }
        }
        updateSearchEditor(cmView);
      }
    });

    tick().then(focusInput);
  } else if (!currentlyOpen && wasOpen) {
    if (cmView) closeSearchPanel(cmView);
    wasOpen = false;
    clearSearch(cmView);
    // Restore editor focus for close paths that don't go through close()
    // (e.g. ctrl+f toggling the panel shut).
    cmView?.focus();
  }
});

$effect(() => {
  if (!isOpen || !panelRef) {
    barHeight = 0;
    return;
  }
  const el = panelRef;
  const observer = new ResizeObserver(() => {
    barHeight = el.offsetHeight;
  });
  observer.observe(el);
  barHeight = el.offsetHeight;
  return () => observer.disconnect();
});

$effect(() => {
  const view = cmView;
  if (isOpen && view) {
    untrack(() => executeSearch(view));
  }
});

function close() {
  isOpen = false;
  clearSearch(cmView);
  cmView?.focus();
}

function executeSearch(view: EditorView) {
  if (searchScope === "current") {
    if (searchState.findText) {
      selectNearestMatch(view);
    } else {
      updateSearchEditor(view);
    }
  } else {
    clearSearch(view);
    searchAllTabs();
  }
}

const debouncedSearch = debounce((view: EditorView) => {
  executeSearch(view);
}, CONFIG.EDITOR.SEARCH_DEBOUNCE_MS);

const debouncedReplace = debounce((view: EditorView) => {
  updateSearchEditor(view);
}, CONFIG.EDITOR.SEARCH_DEBOUNCE_MS);

function onInput() {
  if (!cmView) return;
  debouncedSearch(cmView);
}

function onScopeChange() {
  if (cmView) executeSearch(cmView);
}

function toggleMatchCase() {
  searchState.matchCase = !searchState.matchCase;
  if (cmView) executeSearch(cmView);
}

function toggleWholeWord() {
  searchState.matchWholeWord = !searchState.matchWholeWord;
  if (cmView) executeSearch(cmView);
}

function toggleRegex() {
  searchState.useRegex = !searchState.useRegex;
  if (cmView) executeSearch(cmView);
}

function toggleScope() {
  searchScope = searchScope === "current" ? "all" : "current";
  onScopeChange();
}

function onReplaceInput() {
  if (!cmView) return;
  debouncedReplace(cmView);
}

function onFindNext() {
  if (cmView && !searchState.regexError) {
    findNext(cmView);
    updateSearchEditor(cmView);
    searchInputRef?.focus();
  }
}

function onFindPrevious() {
  if (cmView && !searchState.regexError) {
    findPrevious(cmView);
    updateSearchEditor(cmView);
    searchInputRef?.focus();
  }
}

function onReplace() {
  if (cmView && !searchState.regexError) {
    replaceNext(cmView);
    updateSearchEditor(cmView);
  }
}

function onReplaceAll() {
  if (searchState.regexError) return;

  if (searchScope === "current") {
    if (cmView) {
      replaceAll(cmView);
      updateSearchEditor(cmView);
    }
  } else {
    cmView?.flushPendingContent?.();
    const count = replaceAllInTabs();
    if (count > 0) {
      showToast("success", $_("findReplace.replacedCount", { values: { count } }));
    }
  }
}

function getFocusableItems(): HTMLElement[] {
  if (!panelRef) return [];
  return [...panelRef.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")].filter(
    (el) => el.offsetParent !== null,
  );
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Tab" || e.key === "ISO_Left_Tab") {
    const shiftTab = e.shiftKey || e.key === "ISO_Left_Tab";
    const items = getFocusableItems();
    const first = items[0];
    const last = items[items.length - 1];
    if (first && last) {
      if (shiftTab && e.target === first) {
        e.preventDefault();
        last.focus();
        return;
      }
      if (!shiftTab && e.target === last) {
        e.preventDefault();
        first.focus();
        return;
      }
    }
  }
  if (e.key === "Escape") {
    e.stopPropagation();
    close();
  } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
    // Buttons need Enter for their own click; only the text fields act on it.
    if (isReplaceMode && e.ctrlKey) {
      e.preventDefault();
      onReplaceAll();
    } else if (searchScope === "current") {
      e.preventDefault();
      if (e.shiftKey) {
        onFindPrevious();
      } else {
        onFindNext();
      }
    }
  } else if ((e.key === "f" || e.key === "h") && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "h") isReplaceMode = true;
    focusInput();
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "F3") {
    if (isModalOpen()) return;
    e.preventDefault();
    e.stopPropagation();

    if (!searchState.findText && !isOpen) {
      isOpen = true;
      return;
    }

    if (!isOpen) isOpen = true;

    if (e.shiftKey) {
      onFindPrevious();
    } else {
      onFindNext();
    }
  }
}

function handleBlur(e: FocusEvent) {
  if (!appContext.settings.findPanelCloseOnBlur) return;

  // Decide from the blur event's relatedTarget instead of a deferred
  // activeElement check: opening the panel schedules a focusInput() that can
  // land after the blur and re-focus the search field, so a delayed check
  // would see focus back inside the panel and never close it.
  const next = e.relatedTarget;
  if (next instanceof Node && panelRef?.contains(next)) return;
  if (isMouseOver) return;
  close();
}

function navigateToTab(tabId: string) {
  appContext.app.activeTabId = tabId;
}

onMount(() => {
  window.addEventListener("keydown", handleGlobalKeydown, { capture: true });
  return () => {
    window.removeEventListener("keydown", handleGlobalKeydown, { capture: true });
  };
});
</script>

{#if isOpen}
  <div
    bind:this={panelRef}
    class="find-bar bg-bg-panel absolute top-0 right-0 left-0 z-50 flex flex-col border-b"
    style:background-color={`color-mix(in srgb, var(--surface-2) ${panelOpacity * 100}%, transparent)`}
    onkeydown={handleKeydown}
    onfocusout={handleBlur}
    onmouseenter={() => (isMouseOver = true)}
    onmouseleave={() => (isMouseOver = false)}
    role="dialog"
    aria-label={$_("findReplace.aria")}
    tabindex="-1"
  >
    <div class="find-row flex items-center gap-2 px-2 py-1">
      <div class="find-field relative min-w-0 flex-1">
        <Input
          bind:ref={searchInputRef}
          type="text"
          bind:value={searchState.findText}
          aria-label={$_("findReplace.find")}
          class={searchState.regexError || (searchState.findText && !hasMatches) ? "border-danger" : ""}
          style={`padding-right: 8rem; background-color: ${inputBackground}`}
          oninput={onInput}
          spellcheck="false"
        />
        {#if !searchState.findText}
          <div
            class="text-fg-muted pointer-events-none absolute inset-0 flex items-center gap-1.5 px-3 text-ui opacity-60"
          >
            <Search size={14} class="shrink-0" />
            <span class="truncate">{$_("findReplace.find")}</span>
          </div>
        {/if}
        <div class="absolute top-0 right-0 bottom-0 flex items-center gap-0.5 pr-1">
          <button
            type="button"
            class="btn-icon h-7 w-7"
            aria-pressed={searchState.matchCase}
            aria-label={$_("findReplace.matchCase")}
            onclick={toggleMatchCase}
            use:tooltip={$_("findReplace.matchCase")}
          >
            <CaseSensitive size={16} />
          </button>
          <button
            type="button"
            class="btn-icon h-7 w-7"
            aria-pressed={searchState.matchWholeWord}
            aria-label={$_("findReplace.wholeWord")}
            onclick={toggleWholeWord}
            use:tooltip={$_("findReplace.wholeWord")}
          >
            <WholeWord size={16} />
          </button>
          <button
            type="button"
            class="btn-icon h-7 w-7"
            aria-pressed={searchState.useRegex}
            aria-label={$_("findReplace.regex")}
            onclick={toggleRegex}
            use:tooltip={$_("findReplace.regex")}
          >
            <Regex size={16} />
          </button>
          <button
            type="button"
            class="btn-icon h-7 w-7"
            aria-pressed={searchScope === "all"}
            aria-label={$_("findReplace.allOpenDocuments")}
            onclick={toggleScope}
            use:tooltip={searchScope === "all" ? $_("findReplace.allOpenDocuments") : $_("findReplace.currentDocument")}
          >
            {#if searchScope === "all"}
              <Files size={16} />
            {:else}
              <File size={16} />
            {/if}
          </button>
        </div>
      </div>

      <div class="text-fg-muted min-w-8 text-center text-ui whitespace-nowrap {hasMatches ? "" : "opacity-50"}">
        {#if searchScope === "current"}
          {searchState.currentMatches > 0 ? searchState.currentIndex + 1 : 0}
          / {searchState.currentMatches}
        {:else if searchState.allTabsResults.size > 0}
          {$_("findReplace.tabs", { values: { count: searchState.allTabsResults.size } })}
        {:else}
          {$_("findReplace.zeroTabs")}
        {/if}
      </div>

      <button
        type="button"
        class="btn-icon h-7 w-7"
        onclick={onFindPrevious}
        disabled={searchScope === "all" || !!searchState.regexError}
        aria-label={$_("common.previous")}
        use:tooltip={$_("common.previous")}
      >
        <ChevronUp size={18} />
      </button>
      <button
        type="button"
        class="btn-icon h-7 w-7"
        onclick={onFindNext}
        disabled={searchScope === "all" || !!searchState.regexError}
        aria-label={$_("common.next")}
        use:tooltip={$_("common.next")}
      >
        <ChevronDown size={18} />
      </button>
      <div class="border-border-primary h-4 border-l"></div>
      <button
        type="button"
        class="btn-icon h-7 w-7"
        aria-pressed={isReplaceMode}
        aria-label={$_(isReplaceMode ? "findReplace.hideReplace" : "findReplace.showReplace")}
        onclick={() => (isReplaceMode = !isReplaceMode)}
        use:tooltip={$_(isReplaceMode ? "findReplace.hideReplace" : "findReplace.showReplace")}
      >
        <ArrowRightLeft size={16} />
      </button>
      <div class="find-tail flex min-w-0 items-center gap-2" class:replace-mode={isReplaceMode}>
        {#if isReplaceMode}
          <div class="replace-field min-w-0 flex-1">
            <Input
              type="text"
              bind:value={searchState.replaceText}
              placeholder={$_("findReplace.replace")}
              style={`background-color: ${inputBackground}`}
              oninput={onReplaceInput}
              spellcheck="false"
            />
          </div>
          <button
            type="button"
            class="btn-icon h-7 w-7"
            onclick={onReplace}
            disabled={searchScope === "all" || !!searchState.regexError}
            aria-label={$_("common.replace")}
            use:tooltip={$_("common.replace")}
          >
            <Replace size={16} />
          </button>
          <button
            type="button"
            class="btn-icon h-7 w-7"
            onclick={onReplaceAll}
            disabled={!!searchState.regexError}
            aria-label={$_("findReplace.replaceAll")}
            use:tooltip={$_("findReplace.replaceAll")}
          >
            <ReplaceAll size={16} />
          </button>
        {/if}
        <button
          type="button"
          class="btn-icon ml-auto h-7 w-7"
          aria-label={$_("findReplace.closeEsc")}
          onclick={close}
          use:tooltip={$_("findReplace.closeEsc")}
        >
          <X size={16} />
        </button>
      </div>
    </div>

    {#if searchState.regexError}
      <div class="text-danger bg-danger/10 border-danger/30 mx-2 mb-1 rounded border px-2 py-1 text-ui-sm">
        {searchState.regexError}
      </div>
    {/if}

    {#if searchScope === "all" && searchState.allTabsResults.size > 0}
      <div class="flex max-h-50 flex-col gap-1 overflow-y-auto px-2 pb-1">
        <div class="text-fg-muted mb-1 text-ui font-semibold">{$_("findReplace.results")}</div>
        {#each [...searchState.allTabsResults.entries()] as [tabId, count] (tabId)}
          {@const tab = appContext.editor.tabs.find((t) => t.id === tabId)}
          {#if tab}
            <button
              type="button"
              class="bg-bg-hover hover:bg-bg-active flex w-full items-center justify-between rounded border-none p-1.5 px-2 text-left transition-colors"
              onclick={() => navigateToTab(tabId)}
            >
              <span class="text-fg-default overflow-hidden text-ui text-ellipsis whitespace-nowrap">{tab.title}</span>
              <span class="text-fg-muted bg-bg-panel rounded-xl px-2 py-0.5 text-ui-sm">{count}</span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
/* The bar spans the editor's padding box, which includes the minimap and
   scrollbar columns; both tracks sit at z-index 60, above the bar's z-50. */
.find-bar {
  z-index: 70;
}

.find-field,
.replace-field {
  max-width: 460px;
}

/* The bar sits in the editor pane, so a window breakpoint would be wrong:
   wrap when the row itself runs out of room. */
.find-row {
  flex-wrap: wrap;
}

/* Enough for the four inline buttons and a few characters of query. */
.find-field {
  min-width: 12rem;
}

.replace-field {
  min-width: 8rem;
}

/* The close button travels with the replace controls, so a wrapped row never
   leaves it alone on its own line. */
.find-tail:not(.replace-mode) {
  margin-left: auto;
}

/* replace field (8rem) + three buttons (5.25rem) + three gaps (1.5rem) */
.find-tail.replace-mode {
  flex: 1;
  min-width: 14.75rem;
}

.find-bar .btn-icon:focus-visible {
  background-color: var(--surface-active);
  color: var(--accent-secondary);
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}
</style>
