<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { searchManager } from "$lib/utils/searchManager.svelte.ts";
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

    // Actions
    function focusAndSelectInput() {
        if (searchInputRef) {
            searchInputRef.focus();
            searchInputRef.select();
        }
    }

    function returnFocusToInput() {
        // Only focus, do not select text
        searchInputRef?.focus();
    }

    export function setReplaceMode(enable: boolean) {
        isReplaceMode = enable;
    }

    // Effect 1: Handle Opening/Closing Lifecycle
    $effect(() => {
        const currentlyOpen = isOpen;

        if (currentlyOpen && !wasOpen) {
            wasOpen = true;
            tick().then(focusAndSelectInput);

            untrack(() => {
                if (searchManager.findText && cmView) {
                    searchManager.updateEditor(cmView);
                }
            });
        } else if (!currentlyOpen && wasOpen) {
            wasOpen = false;
            searchManager.clear(cmView);
        }
    });

    // Effect 2: Handle reactive updates (Scope change, Replace mode change)
    $effect(() => {
        const _scope = searchScope;
        const _replace = isReplaceMode;
        const view = cmView;

        if (isOpen && view) {
            untrack(() => executeSearch(view, false));
        }
    });

    function close() {
        isOpen = false;
        searchManager.clear(cmView);
        cmView?.focus();
    }

    /**
     * Core Search Logic
     * @param view Active EditorView
     * @param incremental If true (typing), we select the nearest match without jumping around.
     */
    function executeSearch(view: EditorView, incremental: boolean) {
        if (searchScope === "current") {
            if (searchManager.findText) {
                if (incremental) {
                    // While typing: select nearest match (preserve context)
                    searchManager.selectNearestMatch(view);
                } else {
                    // On scope change or fresh open: find next
                    searchManager.updateEditor(view);
                    if (searchManager.currentMatches > 0) {
                        // If we aren't already on a match, go to next
                        findNext(view);
                        searchManager.updateEditor(view);
                    }
                }
            } else {
                searchManager.updateEditor(view); // Clear highlights
            }
        } else {
            searchManager.clear(view);
            searchManager.searchAllTabs();
        }
    }

    // Input Handler (Typing)
    function onInput() {
        if (!cmView) return;
        executeSearch(cmView, true);
    }

    // Replace Input Handler
    function onReplaceInput() {
        if (!cmView) return;
        // Just update the state so CM knows about the replacement text
        searchManager.updateEditor(cmView);
    }

    function onFindNext() {
        if (cmView) {
            findNext(cmView);
            searchManager.updateEditor(cmView);
            returnFocusToInput();
        }
    }

    function onFindPrevious() {
        if (cmView) {
            findPrevious(cmView);
            searchManager.updateEditor(cmView);
            returnFocusToInput();
        }
    }

    function onReplace() {
        if (cmView) {
            // Ensure CM has the latest query (including replace text) before executing
            searchManager.updateEditor(cmView);
            replaceNext(cmView);
            searchManager.updateEditor(cmView);
        }
    }

    function onReplaceAll() {
        if (searchScope === "current") {
            if (cmView) {
                // Ensure CM has the latest query (including replace text) before executing
                searchManager.updateEditor(cmView);
                replaceAll(cmView);
                searchManager.updateEditor(cmView);
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
            e.preventDefault(); // Prevent form submission or newline
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
            focusAndSelectInput();
        }
    }

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.key === "F3") {
            e.preventDefault();
            e.stopPropagation();

            if (!searchManager.findText && !isOpen) {
                isOpen = true;
                return; // Effect 1 will handle focus
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
        if (!appState.findPanelCloseOnBlur) return;
        
        // Use setTimeout to allow the focus change to complete
        setTimeout(() => {
            // Check if the new focused element is within the panel
            const activeElement = document.activeElement;
            if (panelRef && !panelRef.contains(activeElement) && !isMouseOver) {
                close();
            }
        }, 0);
    }

    function navigateToTab(tabId: string) {
        appState.activeTabId = tabId;
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
        class="find-replace-panel" 
        class:transparent={appState.findPanelTransparent && !isMouseOver}
        onkeydown={handleKeydown} 
        onfocusout={handleBlur}
        onmouseenter={() => isMouseOver = true}
        onmouseleave={() => isMouseOver = false}
        role="dialog" 
        aria-label="Find and Replace"
        tabindex="-1"
    >
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
                <input bind:this={searchInputRef} type="text" bind:value={searchManager.findText} placeholder="Find" class="search-input" oninput={onInput} spellcheck="false" />
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
                    <input type="text" bind:value={searchManager.replaceText} placeholder="Replace" class="search-input" oninput={onReplaceInput} spellcheck="false" />
                </div>
            {/if}

            <!-- Options -->
            <div class="options-row">
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.matchCase} onchange={() => executeSearch(cmView!, false)} />
                    <span>Match Case</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.matchWholeWord} onchange={() => executeSearch(cmView!, false)} />
                    <span>Whole Word</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={searchManager.useRegex} onchange={() => executeSearch(cmView!, false)} />
                    <span>Regex</span>
                </label>
            </div>

            <!-- Scope Selector -->
            <div class="scope-row">
                <label class="radio-label">
                    <input type="radio" bind:group={searchScope} value="current" />
                    <span>Current Document</span>
                </label>
                <label class="radio-label">
                    <input type="radio" bind:group={searchScope} value="all" />
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
        transition: opacity 200ms ease-in-out;
    }

    .find-replace-panel.transparent {
        opacity: 0.15;
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
