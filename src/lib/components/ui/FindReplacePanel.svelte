<script lang="ts">
    import Input from "$lib/components/ui/Input.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { clearSearch, replaceAllInTabs, searchAllTabs, searchState, selectNearestMatch, updateSearchEditor } from "$lib/utils/searchManager.svelte.ts";
    import { debounce } from "$lib/utils/timing";
    import { findNext, findPrevious, replaceAll, replaceNext } from "@codemirror/search";
    import type { EditorView } from "@codemirror/view";
    import { ChevronDown, ChevronRight, Replace, Search, X } from "lucide-svelte";
    import { onMount, tick, untrack } from "svelte";

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
            wasOpen = true;
            tick().then(focusInput);

            untrack(() => {
                if (searchState.findText && cmView) {
                    updateSearchEditor(cmView);
                }
            });
        } else if (!currentlyOpen && wasOpen) {
            wasOpen = false;
            clearSearch(cmView);
        }
    });

    $effect(() => {
        const view = cmView;
        if (isOpen && view) {
            untrack(() => executeSearch(view, false));
        }
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

    function onReplaceInput() {
        if (!cmView) return;
        debouncedReplace(cmView);
    }

    function onFindNext() {
        if (cmView) {
            findNext(cmView);
            updateSearchEditor(cmView);
            searchInputRef?.focus();
        }
    }

    function onFindPrevious() {
        if (cmView) {
            findPrevious(cmView);
            updateSearchEditor(cmView);
            searchInputRef?.focus();
        }
    }

    function onReplace() {
        if (cmView) {
            updateSearchEditor(cmView);
            replaceNext(cmView);
            updateSearchEditor(cmView);
        }
    }

    function onReplaceAll() {
        if (searchScope === "current") {
            if (cmView) {
                updateSearchEditor(cmView);
                replaceAll(cmView);
                updateSearchEditor(cmView);
            }
        } else {
            const count = replaceAllInTabs();
            alert(`Replaced ${count} occurrences across open tabs.`);
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
        if (!appContext.app.findPanelCloseOnBlur) return;

        setTimeout(() => {
            const activeElement = document.activeElement;
            if (panelRef && !panelRef.contains(activeElement) && !isMouseOver) {
                close();
            }
        }, 0);
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
    <div bind:this={panelRef} class="absolute top-0 right-0 w-[400px] max-h-[600px] z-50 flex flex-col transition-opacity duration-200 bg-bg-panel border border-border-main border-t-0 border-r-0 shadow-lg" class:opacity-15={appContext.app.findPanelTransparent && !isMouseOver} onkeydown={handleKeydown} onfocusout={handleBlur} onmouseenter={() => (isMouseOver = true)} onmouseleave={() => (isMouseOver = false)} role="dialog" aria-label="Find and Replace" tabindex="-1">
        <div class="flex items-center p-2 border-b border-border-main text-fg-default">
            <div class="flex items-center gap-2 flex-1">
                <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active" onclick={() => (isReplaceMode = !isReplaceMode)} title="Toggle Replace Mode">
                    {#if isReplaceMode}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                </button>
                <span class="font-semibold text-ui">Find {isReplaceMode ? "& Replace" : ""}</span>
            </div>
            <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active" onclick={close} title="Close (Esc)">
                <X size={14} />
            </button>
        </div>

        <div class="p-3 flex flex-col gap-3 overflow-y-auto max-h-[500px]">
            <div class="flex gap-2 items-center">
                <Input bind:ref={searchInputRef} type="text" bind:value={searchState.findText} placeholder="Find" class="flex-1 text-[13px] leading-6 {searchState.regexError ? 'border-danger' : ''}" oninput={onInput} spellcheck="false" />
                <div class="text-[11px] text-fg-muted min-w-[80px] text-right">
                    {#if searchScope === "current"}
                        {#if searchState.currentMatches > 0}
                            {searchState.currentIndex + 1} of {searchState.currentMatches}
                        {:else if searchState.findText}
                            0 of 0
                        {/if}
                    {:else if searchScope === "all"}
                        {#if searchState.allTabsResults.size > 0}
                            {searchState.allTabsResults.size} tabs
                        {:else if searchState.findText}
                            0 tabs
                        {/if}
                    {/if}
                </div>
            </div>
            
            {#if searchState.regexError}
                <div class="text-[11px] text-danger bg-danger/10 px-2 py-1 rounded border border-danger/30">
                    {searchState.regexError}
                </div>
            {/if}

            {#if isReplaceMode}
                <div class="flex gap-2 items-center">
                    <Input type="text" bind:value={searchState.replaceText} placeholder="Replace" class="flex-1 text-[13px] leading-6" oninput={onReplaceInput} spellcheck="false" />
                </div>
            {/if}

            <div class="flex gap-4 flex-wrap">
                <label class="flex items-center gap-1.5 text-[13px] text-fg-default cursor-pointer">
                    <input type="checkbox" bind:checked={searchState.matchCase} onchange={() => executeSearch(cmView!, false)} class="w-3.5 h-3.5 cursor-pointer accent-accent-primary" />
                    <span>Match Case</span>
                </label>
                <label class="flex items-center gap-1.5 text-[13px] text-fg-default cursor-pointer">
                    <input type="checkbox" bind:checked={searchState.matchWholeWord} onchange={() => executeSearch(cmView!, false)} class="w-3.5 h-3.5 cursor-pointer accent-accent-primary" />
                    <span>Whole Word</span>
                </label>
                <label class="flex items-center gap-1.5 text-[13px] text-fg-default cursor-pointer">
                    <input type="checkbox" bind:checked={searchState.useRegex} onchange={() => executeSearch(cmView!, false)} class="w-3.5 h-3.5 cursor-pointer accent-accent-primary" />
                    <span>Regex</span>
                </label>
            </div>

            <div class="flex gap-4 flex-wrap">
                <label class="flex items-center gap-1.5 text-[13px] text-fg-default cursor-pointer">
                    <input type="radio" bind:group={searchScope} value="current" class="w-3.5 h-3.5 cursor-pointer accent-accent-primary" />
                    <span>Current Document</span>
                </label>
                <label class="flex items-center gap-1.5 text-[13px] text-fg-default cursor-pointer">
                    <input type="radio" bind:group={searchScope} value="all" class="w-3.5 h-3.5 cursor-pointer accent-accent-primary" />
                    <span>All Open Documents</span>
                </label>
            </div>

            <div class="flex gap-2 flex-wrap">
                <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active disabled:opacity-50 disabled:cursor-not-allowed" onclick={onFindPrevious} disabled={searchScope === "all"}>
                    <Search size={12} /> Previous
                </button>
                <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active disabled:opacity-50 disabled:cursor-not-allowed" onclick={onFindNext} disabled={searchScope === "all"}>
                    <Search size={12} /> Next
                </button>
                {#if isReplaceMode}
                    <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active disabled:opacity-50 disabled:cursor-not-allowed" onclick={onReplace} disabled={searchScope === "all"}>
                        <Replace size={12} /> Replace
                    </button>
                    <button type="button" class="p-1 px-2.5 rounded text-[13px] flex items-center gap-1.5 transition-all bg-bg-hover border border-border-light text-fg-default hover:bg-bg-active" onclick={onReplaceAll}>
                        <Replace size={12} /> Replace All
                    </button>
                {/if}
            </div>

            {#if searchScope === "all" && searchState.allTabsResults.size > 0}
                <div class="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                    <div class="text-[11px] font-semibold mb-1 text-fg-muted">Results:</div>
                    {#each [...searchState.allTabsResults.entries()] as [tabId, count]}
                        {@const tab = appContext.editor.tabs.find((t) => t.id === tabId)}
                        {#if tab}
                            <button type="button" class="flex items-center justify-between p-1.5 px-2 rounded cursor-pointer transition-colors bg-bg-hover hover:bg-bg-active border-none w-full text-left" onclick={() => navigateToTab(tabId)}>
                                <span class="text-[13px] overflow-hidden text-ellipsis whitespace-nowrap text-fg-default">{tab.title}</span>
                                <span class="text-[11px] text-fg-muted bg-bg-panel px-2 py-0.5 rounded-xl">{count}</span>
                            </button>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
