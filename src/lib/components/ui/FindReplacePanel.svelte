<script lang="ts">
    import Input from '$lib/components/ui/Input.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { CONFIG } from '$lib/utils/config';
    import {
        clearSearch,
        ensureQuerySync,
        replaceAllInTabs,
        searchAllTabs,
        searchState,
        selectNearestMatch,
        updateSearchEditor,
    } from '$lib/utils/searchManager.svelte.ts';
    import { debounce } from '$lib/utils/timing';
    import {
        closeSearchPanel,
        findNext,
        findPrevious,
        openSearchPanel,
        replaceAll,
        replaceNext,
    } from '@codemirror/search';
    import type { EditorView } from '@codemirror/view';
    import { ChevronDown, ChevronRight, Replace, Search, X } from 'lucide-svelte';
    import { onMount, tick, untrack } from 'svelte';

    let { isOpen = $bindable(false), cmView } = $props<{
        isOpen?: boolean;
        cmView: EditorView | undefined;
    }>();

    let searchScope = $state<'current' | 'all'>('current');
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
            if (cmView) openSearchPanel(cmView);
            wasOpen = true;

            // Prefill with selected text if available
            untrack(() => {
                if (cmView) {
                    const selection = cmView.state.selection.main;
                    if (selection.from !== selection.to) {
                        // Text is selected, use it as the search term
                        const selectedText = cmView.state.doc.sliceString(
                            selection.from,
                            selection.to,
                        );
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
        if (searchScope === 'current') {
            if (searchState.findText) {
                if (incremental) {
                    selectNearestMatch(view);
                } else {
                    // Ensure query is synced before finding next to respect case sensitivity
                    ensureQuerySync(view);
                    updateSearchEditor(view);
                    if (searchState.currentMatches > 0) {
                        findNext(view as never);
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
        if (cmView && !searchState.regexError) {
            // Ensure query is synced before navigation to respect case sensitivity
            ensureQuerySync(cmView);
            findNext(cmView);
            updateSearchEditor(cmView);
            searchInputRef?.focus();
        }
    }

    function onFindPrevious() {
        if (cmView && !searchState.regexError) {
            // Ensure query is synced before navigation to respect case sensitivity
            ensureQuerySync(cmView);
            findPrevious(cmView);
            updateSearchEditor(cmView);
            searchInputRef?.focus();
        }
    }

    function onReplace() {
        if (cmView && !searchState.regexError) {
            // Ensure query is synced before replace to respect case sensitivity
            ensureQuerySync(cmView);
            replaceNext(cmView);
            updateSearchEditor(cmView);
        }
    }

    function onReplaceAll() {
        if (searchState.regexError) return;

        if (searchScope === 'current') {
            if (cmView) {
                // Ensure query is synced before replace all to respect case sensitivity
                ensureQuerySync(cmView);
                replaceAll(cmView);
                updateSearchEditor(cmView);
            }
        } else {
            const count = replaceAllInTabs();
            if (count > 0) {
                alert(`Replaced ${count} occurrences across open tabs.`);
            }
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } else if (e.key === 'Enter') {
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
        } else if ((e.key === 'f' || e.key === 'h') && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'h') isReplaceMode = true;
            focusInput();
        }
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.key === 'F3') {
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

    function handleBlur() {
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
        window.addEventListener('keydown', handleGlobalKeydown, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleGlobalKeydown, { capture: true });
        };
    });
</script>

{#if isOpen}
    <div
        bind:this={panelRef}
        class="bg-border-main absolute top-0 right-0 z-50 flex max-h-150 w-100 flex-col border border-t-0 border-r-0 shadow-lg backdrop-blur-sm transition-opacity duration-200"
        style="background-color: color-mix(in srgb, var(--color-bg-panel) 82%, transparent);"
        class:opacity-[0.15]={appContext.app.findPanelTransparent && !isMouseOver}
        onkeydown={handleKeydown}
        onfocusout={handleBlur}
        onmouseenter={() => (isMouseOver = true)}
        onmouseleave={() => (isMouseOver = false)}
        role="dialog"
        aria-label="Find and Replace"
        tabindex="-1">
        <div class="bg-border-main text-fg-default flex items-center border-b p-2">
            <div class="flex flex-1 items-center gap-2">
                <button
                    type="button"
                    class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all"
                    onclick={() => (isReplaceMode = !isReplaceMode)}
                    title="Toggle Replace Mode">
                    {#if isReplaceMode}<ChevronDown size={14} />{:else}<ChevronRight
                            size={14} />{/if}
                </button>
                <span class="text-ui font-semibold">Find {isReplaceMode ? '& Replace' : ''}</span>
            </div>
            <button
                type="button"
                class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all"
                onclick={close}
                title="Close (Esc)">
                <X size={14} />
            </button>
        </div>

        <div class="flex max-h-125 flex-col gap-3 overflow-y-auto p-3">
            <div class="flex items-center gap-2">
                <Input
                    bind:ref={searchInputRef}
                    type="text"
                    bind:value={searchState.findText}
                    placeholder="Find"
                    class="flex-1 text-[13px] leading-6 {searchState.regexError
                        ? 'border-danger'
                        : ''}"
                    oninput={onInput}
                    spellcheck="false" />
                <div class="text-fg-muted min-w-20 text-right text-[11px]">
                    {#if searchScope === 'current'}
                        {#if searchState.currentMatches > 0}
                            {searchState.currentIndex + 1} of {searchState.currentMatches}
                        {:else if searchState.findText}
                            0 of 0
                        {/if}
                    {:else if searchScope === 'all'}
                        {#if searchState.allTabsResults.size > 0}
                            {searchState.allTabsResults.size} tabs
                        {:else if searchState.findText}
                            0 tabs
                        {/if}
                    {/if}
                </div>
            </div>

            {#if searchState.regexError}
                <div
                    class="text-danger bg-danger/10 border-danger/30 rounded border px-2 py-1 text-[11px]">
                    {searchState.regexError}
                </div>
            {/if}

            {#if isReplaceMode}
                <div class="flex items-center gap-2">
                    <Input
                        type="text"
                        bind:value={searchState.replaceText}
                        placeholder="Replace"
                        class="flex-1 text-[13px] leading-6"
                        oninput={onReplaceInput}
                        spellcheck="false" />
                </div>
            {/if}

            <div class="flex flex-wrap gap-4">
                <label class="text-fg-default flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="checkbox"
                        bind:checked={searchState.matchCase}
                        onchange={() => executeSearch(cmView!, false)}
                        class="accent-accent-primary h-3.5 w-3.5 cursor-pointer" />
                    <span>Match Case</span>
                </label>
                <label class="text-fg-default flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="checkbox"
                        bind:checked={searchState.matchWholeWord}
                        onchange={() => executeSearch(cmView!, false)}
                        class="accent-accent-primary h-3.5 w-3.5 cursor-pointer" />
                    <span>Whole Word</span>
                </label>
                <label class="text-fg-default flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="checkbox"
                        bind:checked={searchState.useRegex}
                        onchange={() => executeSearch(cmView!, false)}
                        class="accent-accent-primary h-3.5 w-3.5 cursor-pointer" />
                    <span>Regex</span>
                </label>
            </div>

            <div class="flex flex-wrap gap-4">
                <label class="text-fg-default flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="radio"
                        bind:group={searchScope}
                        value="current"
                        class="accent-accent-primary h-3.5 w-3.5 cursor-pointer" />
                    <span>Current Document</span>
                </label>
                <label class="text-fg-default flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input
                        type="radio"
                        bind:group={searchScope}
                        value="all"
                        class="accent-accent-primary h-3.5 w-3.5 cursor-pointer" />
                    <span>All Open Documents</span>
                </label>
            </div>

            <div class="flex flex-wrap gap-2">
                <button
                    type="button"
                    class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all disabled:cursor-not-allowed disabled:opacity-30"
                    onclick={onFindPrevious}
                    disabled={searchScope === 'all' || !!searchState.regexError}>
                    <Search size={12} /> Previous
                </button>
                <button
                    type="button"
                    class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all disabled:cursor-not-allowed disabled:opacity-30"
                    onclick={onFindNext}
                    disabled={searchScope === 'all' || !!searchState.regexError}>
                    <Search size={12} /> Next
                </button>
                {#if isReplaceMode}
                    <button
                        type="button"
                        class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all disabled:cursor-not-allowed disabled:opacity-30"
                        onclick={onReplace}
                        disabled={searchScope === 'all' || !!searchState.regexError}>
                        <Replace size={12} /> Replace
                    </button>
                    <button
                        type="button"
                        class="bg-bg-hover border-border-light text-fg-default hover:bg-bg-active flex items-center gap-1.5 rounded border p-1 px-2.5 text-[13px] transition-all disabled:cursor-not-allowed disabled:opacity-30"
                        onclick={onReplaceAll}
                        disabled={!!searchState.regexError}>
                        <Replace size={12} /> Replace All
                    </button>
                {/if}
            </div>

            {#if searchScope === 'all' && searchState.allTabsResults.size > 0}
                <div class="flex max-h-50 flex-col gap-1 overflow-y-auto">
                    <div class="text-fg-muted mb-1 text-[11px] font-semibold">Results:</div>
                    {#each [...searchState.allTabsResults.entries()] as [tabId, count] (tabId)}
                        {@const tab = appContext.editor.tabs.find((t) => t.id === tabId)}
                        {#if tab}
                            <button
                                type="button"
                                class="bg-bg-hover hover:bg-bg-active flex w-full cursor-pointer items-center justify-between rounded border-none p-1.5 px-2 text-left transition-colors"
                                onclick={() => navigateToTab(tabId)}>
                                <span
                                    class="text-fg-default overflow-hidden text-[13px] text-ellipsis whitespace-nowrap"
                                    >{tab.title}</span>
                                <span
                                    class="text-fg-muted bg-bg-panel rounded-xl px-2 py-0.5 text-[11px]"
                                    >{count}</span>
                            </button>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
