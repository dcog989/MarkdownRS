<script lang="ts">
import { closeSearchPanel, findNext, findPrevious, openSearchPanel, replaceAll, replaceNext } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  File,
  Files,
  Regex,
  Replace,
  Search,
  WholeWord,
  X,
} from "lucide-svelte";
import { onMount, tick, untrack } from "svelte";
import { _ } from "svelte-i18n";
import { tooltip } from "$lib/actions/tooltip";
import Input from "$lib/components/ui/Input.svelte";
import { translate } from "$lib/i18n";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import {
  clearSearch,
  replaceAllInTabs,
  searchAllTabs,
  searchState,
  selectNearestMatch,
  updateSearchEditor,
} from "$lib/utils/searchManager.svelte";
import { debounce } from "$lib/utils/timing";

let { isOpen = $bindable(false), cmView } = $props<{
  isOpen?: boolean;
  cmView: EditorView | undefined;
}>();

let searchScope = $state<"current" | "all">("current");
let isReplaceMode = $state(false);
let searchInputRef = $state<HTMLInputElement>();
let panelRef = $state<HTMLDivElement>();
let wasOpen = false;
let isMouseOver = $state(false);
let panelOpacity = $derived(isMouseOver ? 1 : appContext.settings.findPanelOpacity / 100);
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
  const view = cmView;
  if (isOpen && view) {
    untrack(() => executeSearch(view, false));
  }
});

$effect(() => {
  const view = cmView;
  if (!view || !isOpen || searchScope !== "current") return;
  searchState.findText;
  searchState.matchCase;
  searchState.matchWholeWord;
  searchState.useRegex;
  searchState.replaceText;
  untrack(() => updateSearchEditor(view));
});

function close() {
  isOpen = false;
  clearSearch(cmView);
  cmView?.focus();
}

function executeSearch(view: EditorView, incremental: boolean) {
  if (searchScope === "current") {
    if (searchState.findText) {
      if (incremental) {
        selectNearestMatch(view);
      } else {
        updateSearchEditor(view);
        if (searchState.currentMatches > 0) {
          findNext(view);
          updateSearchEditor(view);
        }
      }
    } else {
      updateSearchEditor(view);
    }
  } else {
    clearSearch(view);
    searchAllTabs();
  }
}

const debouncedSearch = debounce((view: EditorView) => {
  executeSearch(view, true);
}, CONFIG.EDITOR.SEARCH_DEBOUNCE_MS);

const debouncedReplace = debounce((view: EditorView) => {
  updateSearchEditor(view);
}, CONFIG.EDITOR.SEARCH_DEBOUNCE_MS);

function onInput() {
  if (!cmView) return;
  debouncedSearch(cmView);
}

function onScopeChange() {
  if (cmView) executeSearch(cmView, false);
}

function toggleMatchCase() {
  searchState.matchCase = !searchState.matchCase;
  if (cmView) executeSearch(cmView, false);
}

function toggleWholeWord() {
  searchState.matchWholeWord = !searchState.matchWholeWord;
  if (cmView) executeSearch(cmView, false);
}

function toggleRegex() {
  searchState.useRegex = !searchState.useRegex;
  if (cmView) executeSearch(cmView, false);
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
    const count = replaceAllInTabs();
    if (count > 0) {
      alert(translate("findReplace.replacedCount", { values: { count } }));
    }
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    close();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      onFindPrevious();
    } else {
      if (isReplaceMode && e.ctrlKey) {
        onReplaceAll();
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
    class="find-panel bg-bg-panel absolute z-50 flex max-h-150 w-90 flex-col overflow-hidden rounded-lg border shadow-lg"
    style:opacity={panelOpacity}
    onkeydown={handleKeydown}
    onfocusout={handleBlur}
    onmouseenter={() => (isMouseOver = true)}
    onmouseleave={() => (isMouseOver = false)}
    role="dialog"
    aria-label={$_("findReplace.aria")}
    tabindex="-1"
  >
    <div class="bg-bg-header flex items-center gap-1 border-b px-2 py-1">
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

      <div class="ml-1 flex items-center self-stretch border-l pl-2">
        <button
          type="button"
          class="btn-icon h-7 w-7"
          aria-pressed={isReplaceMode}
          aria-label={$_("findReplace.toggleReplaceMode")}
          onclick={() => (isReplaceMode = !isReplaceMode)}
          use:tooltip={$_("findReplace.toggleReplaceMode")}
        >
          <Replace size={16} />
        </button>
      </div>

      <div class="flex-1"></div>

      <button
        type="button"
        class="btn-icon h-7 w-7"
        aria-label={$_("findReplace.closeEsc")}
        onclick={close}
        use:tooltip={$_("findReplace.closeEsc")}
      >
        <X size={16} />
      </button>
    </div>

    <div class="flex max-h-125 flex-col gap-3 overflow-y-auto p-3">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Input
            bind:ref={searchInputRef}
            type="text"
            bind:value={searchState.findText}
            aria-label={$_("findReplace.find")}
            class={searchState.regexError ? "border-danger" : ""}
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
        <div class="flex items-center">
          <button
            type="button"
            class="btn-icon h-8 w-8"
            onclick={onFindPrevious}
            disabled={searchScope === "all" || !!searchState.regexError}
            aria-label={$_("common.previous")}
            use:tooltip={$_("common.previous")}
          >
            <ChevronUp size={24} />
          </button>
          <button
            type="button"
            class="btn-icon -ml-1 h-8 w-8"
            onclick={onFindNext}
            disabled={searchScope === "all" || !!searchState.regexError}
            aria-label={$_("common.next")}
            use:tooltip={$_("common.next")}
          >
            <ChevronDown size={24} />
          </button>
        </div>
      </div>

      {#if searchState.regexError}
        <div class="text-danger bg-danger/10 border-danger/30 rounded border px-2 py-1 text-ui-sm">
          {searchState.regexError}
        </div>
      {/if}

      {#if isReplaceMode}
        <div class="flex items-center gap-2">
          <Input
            type="text"
            bind:value={searchState.replaceText}
            placeholder={$_("findReplace.replace")}
            class="flex-1"
            oninput={onReplaceInput}
            spellcheck="false"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-base btn-sm btn-outline"
            onclick={onReplace}
            disabled={searchScope === "all" || !!searchState.regexError}
          >
            <Replace size={12} />
            {$_("common.replace")}
          </button>
          <button
            type="button"
            class="btn-base btn-sm btn-outline"
            onclick={onReplaceAll}
            disabled={!!searchState.regexError}
          >
            <Replace size={12} />
            {$_("findReplace.replaceAll")}
          </button>
        </div>
      {/if}

      {#if searchScope === "all" && searchState.allTabsResults.size > 0}
        <div class="flex max-h-50 flex-col gap-1 overflow-y-auto">
          <div class="text-fg-muted mb-1 text-ui font-semibold">{$_("findReplace.results")}</div>
          {#each [...searchState.allTabsResults.entries()] as [tabId, count] (tabId)}
            {@const tab = appContext.editor.tabs.find((t) => t.id === tabId)}
            {#if tab}
              <button
                type="button"
                class="bg-bg-hover hover:bg-bg-active flex w-full cursor-pointer items-center justify-between rounded border-none p-1.5 px-2 text-left transition-colors"
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
  </div>
{/if}

<style>
.find-panel {
  top: 0.5rem;
  right: calc(var(--find-panel-right, 0px) + 0.5rem);
}
</style>
