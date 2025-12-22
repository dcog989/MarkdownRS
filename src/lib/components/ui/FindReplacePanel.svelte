<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { searchManager } from "$lib/utils/searchManager.svelte.ts";
    import { findNext, findPrevious, replaceAll, replaceNext, setSearchQuery } from "@codemirror/search";
    import type { EditorView } from "@codemirror/view";
    import { ChevronDown, ChevronRight, Replace, Search, X } from "lucide-svelte";
    import { tick } from "svelte";

    let { isOpen = $bindable(false), editorView } = $props<{
        isOpen?: boolean;
        editorView: any;
    }>();

    let searchScope = $state<"current" | "all">("current");
    let isReplaceMode = $state(false);
    let searchInputRef = $state<HTMLInputElement>();

    // Helper to get actual CM instance
    const getView = (): EditorView | undefined => editorView?.getView?.();

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
        if (isOpen) {
            tick().then(focusInput);
            handleSearch();
        } else {
            searchManager.clear(getView());
        }
    });

    function close() {
        isOpen = false;
        searchManager.clear(getView());
        getView()?.focus();
    }

    function handleSearch() {
        if (searchScope === "current") {
            // Update CodeMirror directly
            const view = getView();
            if (view) {
                // Sync manager state to CM state
                view.dispatch({ effects: setSearchQuery.of(searchManager.getQuery()) });
                // Calculate stats
                searchManager.updateEditor(view);

                // If this is a fresh search (matches > 0 but we aren't selecting one), jump to first
                if (searchManager.currentMatches > 0 && searchManager.currentIndex === 0) {
                    findNext(view);
                    searchManager.updateEditor(view);
                }
            }
        } else {
            searchManager.clear(getView()); // Clear highlighting in current editor
            searchManager.searchAllTabs();
        }
    }

    function onFindNext() {
        const view = getView();
        if (view) {
            findNext(view);
            searchManager.updateEditor(view);
        }
    }

    function onFindPrevious() {
        const view = getView();
        if (view) {
            findPrevious(view);
            searchManager.updateEditor(view);
        }
    }

    function onReplace() {
        const view = getView();
        if (view) {
            replaceNext(view);
            searchManager.updateEditor(view);
        }
    }

    function onReplaceAll() {
        if (searchScope === "current") {
            const view = getView();
            if (view) {
                replaceAll(view);
                searchManager.updateEditor(view);
            }
        } else {
            const count = searchManager.replaceAllInTabs();
            alert(`Replaced ${count} occurrences across open tabs.`);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
        } else if (e.key === "Enter") {
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

    function navigateToTab(tabId: string) {
        appState.activeTabId = tabId;
        // The editor will mount and eventually sync with the search manager via its own effect or we re-trigger here
        // But for now, simple navigation is enough.
    }
</script>

{#if isOpen}
    <div class="find-replace-panel" onkeydown={handleKeydown} role="dialog" aria-label="Find and Replace" tabindex="-1">
        <div class="panel-header">
            <div class="flex items-center gap-2 flex-1">
                <button type="button" class="icon-btn" onclick={() => (isReplaceMode = !isReplaceMode)} title="Toggle Replace Mode">
                    {#if isReplaceMode}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                </button>
                <span class="font-semibold text-ui">Find {isReplaceMode ? "& Replace" : ""}</span>
            </div>
            <button type="button" class="icon-btn" onclick={close} title="Close (Esc)">
                <X size={14} />
            </button>
        </div>

        <div class="panel-content">
            <!-- Find Input -->
            <div class="input-row">
                <input bind:this={searchInputRef} type="text" bind:value={searchManager.findText} placeholder="Find" class="search-input" oninput={handleSearch} />
                <div class="result-indicator">
                    {#if searchScope === "current"}
                        {#if searchManager.currentMatches > 0}
                            {searchManager.currentIndex + 1} of {searchManager.currentMatches}
                        {:else if searchManager.findText}
                            0 of 0
                        {/if}
                    {:else if searchScope === "all"}
                        {#if searchManager.allTabsResults.size > 0}
                            {searchManager.allTabsResults.size} tabs
                        {:else if searchManager.findText}
                            0 tabs
                        {/if}
                    {/if}
                </div>
            </div>

            <!-- Replace Input -->
            {#if isReplaceMode}
                <div class="input-row">
                    <input type="text" bind:value={searchManager.replaceText} placeholder="Replace" class="search-input" />
                </div>
            {/if}

            <!-- Options -->
            <div class="options-row">
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.matchCase} onchange={handleSearch} />
                    <span>Match Case</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.matchWholeWord} onchange={handleSearch} />
                    <span>Whole Word</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.useRegex} onchange={handleSearch} />
                    <span>Regex</span>
                </label>
            </div>

            <!-- Scope Selector -->
            <div class="scope-row">
                <label class="radio-label">
                    <input type="radio" bind:group={searchScope} value="current" onchange={handleSearch} />
                    <span>Current Document</span>
                </label>
                <label class="radio-label">
                    <input type="radio" bind:group={searchScope} value="all" onchange={handleSearch} />
                    <span>All Open Documents</span>
                </label>
            </div>

            <!-- Actions -->
            <div class="actions-row">
                <button type="button" class="action-btn" onclick={onFindPrevious} disabled={searchScope === "all"}>
                    <Search size={12} /> Previous
                </button>
                <button type="button" class="action-btn" onclick={onFindNext} disabled={searchScope === "all"}>
                    <Search size={12} /> Next
                </button>
                {#if isReplaceMode}
                    <button type="button" class="action-btn" onclick={onReplace} disabled={searchScope === "all"}>
                        <Replace size={12} /> Replace
                    </button>
                    <button type="button" class="action-btn" onclick={onReplaceAll}>
                        <Replace size={12} /> Replace All
                    </button>
                {/if}
            </div>

            <!-- All Tabs Results -->
            {#if searchScope === "all" && searchManager.allTabsResults.size > 0}
                <div class="results-list">
                    <div class="results-header">Results:</div>
                    {#each [...searchManager.allTabsResults.entries()] as [tabId, count]}
                        {@const tab = editorStore.tabs.find((t) => t.id === tabId)}
                        {#if tab}
                            <button type="button" class="result-item" onclick={() => navigateToTab(tabId)}>
                                <span class="result-filename">{tab.title}</span>
                                <span class="result-count">{count}</span>
                            </button>
                        {/if}
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .find-replace-panel {
        position: absolute;
        top: 0;
        right: 0;
        width: 400px;
        max-height: 600px;
        background-color: var(--color-bg-panel);
        border: 1px solid var(--color-border-main);
        border-top: none;
        border-right: none;
        box-shadow: -2px 2px 8px rgba(0, 0, 0, 0.3);
        z-index: 50;
        display: flex;
        flex-direction: column;
    }

    .panel-header {
        display: flex;
        align-items: center;
        padding: 0.5rem;
        border-bottom: 1px solid var(--color-border-main);
        color: var(--color-fg-default);
    }

    .panel-content {
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow-y: auto;
        max-height: 500px;
    }

    .input-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .search-input {
        flex: 1;
        padding: 0.3rem 0.5rem;
        background-color: var(--color-bg-input);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-fg-default);
        font-size: 13px;
        line-height: 1.5;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
    }

    .result-indicator {
        font-size: 11px;
        color: var(--color-fg-muted);
        min-width: 80px;
        text-align: right;
    }

    .options-row,
    .scope-row {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .checkbox-label,
    .radio-label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 13px;
        color: var(--color-fg-default);
        cursor: pointer;
    }

    .checkbox-label input[type="checkbox"],
    .radio-label input[type="radio"] {
        width: 14px;
        height: 14px;
        cursor: pointer;
        accent-color: var(--color-accent-primary);
    }

    .actions-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .icon-btn,
    .action-btn {
        padding: 0.25rem 0.6rem;
        background-color: var(--color-bg-hover);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-fg-default);
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        transition: all 150ms;
    }

    .icon-btn:hover,
    .action-btn:hover {
        background-color: var(--color-bg-active);
    }

    .icon-btn:disabled,
    .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .results-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        max-height: 200px;
        overflow-y: auto;
    }

    .results-header {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-fg-muted);
        margin-bottom: 0.25rem;
    }

    .result-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.4rem 0.5rem;
        background-color: var(--color-bg-hover);
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 150ms;
        border: none;
        width: 100%;
        text-align: left;
    }

    .result-item:hover {
        background-color: var(--color-bg-active);
    }

    .result-filename {
        font-size: 13px;
        color: var(--color-fg-default);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-count {
        font-size: 11px;
        color: var(--color-fg-muted);
        background-color: var(--color-bg-panel);
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
    }
</style>
