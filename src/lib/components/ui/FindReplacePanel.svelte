<script lang="ts">
    /**
     * Find/Replace Panel Component
     * Supports find/replace in current document and all open tabs
     */
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { ChevronDown, ChevronRight, Replace, Search, X } from "lucide-svelte";
    import { tick } from "svelte";

    let { isOpen = $bindable(false), editorView } = $props<{
        isOpen?: boolean;
        editorView: any;
    }>();

    let findText = $state("");
    let replaceText = $state("");
    let matchCase = $state(false);
    let matchWholeWord = $state(false);
    let useRegex = $state(false);
    let searchScope = $state<"current" | "all">("current");
    let isReplaceMode = $state(false);
    let searchInputRef = $state<HTMLInputElement>();

    // Results
    let currentMatches = $state<number>(0);
    let currentIndex = $state<number>(0);
    let allTabsResults = $state<Map<string, number>>(new Map());

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
            tick().then(() => {
                focusInput();
            });
        }
    });

    function close() {
        isOpen = false;
        // Don't clear text immediately to allow reopening with same query
        if (editorView) editorView.getView()?.focus();
    }

    function buildSearchRegex(text: string): RegExp | null {
        if (!text) return null;

        try {
            let pattern = text;
            if (!useRegex) {
                // Escape special regex characters
                pattern = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }

            if (matchWholeWord) {
                pattern = `\\b${pattern}\\b`;
            }

            const flags = matchCase ? "g" : "gi";
            return new RegExp(pattern, flags);
        } catch (e) {
            console.error("Invalid regex:", e);
            return null;
        }
    }

    function findInCurrentDocument() {
        if (!findText || !editorView) return;

        const view = editorView.getView?.();
        if (!view) return;

        const doc = view.state.doc;
        const text = doc.toString();
        const regex = buildSearchRegex(findText);

        if (!regex) {
            currentMatches = 0;
            return;
        }

        const matches = [...text.matchAll(regex)];
        currentMatches = matches.length;
        currentIndex = 0;

        // Highlight first match
        if (matches.length > 0) {
            const match = matches[0];
            const from = match.index!;
            const to = from + match[0].length;

            view.dispatch({
                selection: { anchor: from, head: to },
                scrollIntoView: true,
            });
        }
    }

    function findNext() {
        if (!findText || !editorView || currentMatches === 0) return;

        const view = editorView.getView?.();
        if (!view) return;

        const doc = view.state.doc;
        const text = doc.toString();
        const regex = buildSearchRegex(findText);
        if (!regex) return;

        const matches = [...text.matchAll(regex)];

        if (matches.length === 0) return;

        // Move to next match
        currentIndex = (currentIndex + 1) % matches.length;
        const match = matches[currentIndex];
        const from = match.index!;
        const to = from + match[0].length;

        view.dispatch({
            selection: { anchor: from, head: to },
            scrollIntoView: true,
        });
    }

    function findPrevious() {
        if (!findText || !editorView || currentMatches === 0) return;

        const view = editorView.getView?.();
        if (!view) return;

        const doc = view.state.doc;
        const text = doc.toString();
        const regex = buildSearchRegex(findText);
        if (!regex) return;

        const matches = [...text.matchAll(regex)];

        if (matches.length === 0) return;

        // Move to previous match
        currentIndex = currentIndex - 1;
        if (currentIndex < 0) currentIndex = matches.length - 1;

        const match = matches[currentIndex];
        const from = match.index!;
        const to = from + match[0].length;

        view.dispatch({
            selection: { anchor: from, head: to },
            scrollIntoView: true,
        });
    }

    function replaceCurrentMatch() {
        if (!findText || !editorView) return;

        const view = editorView.getView?.();
        if (!view) return;

        const selection = view.state.selection.main;
        const selectedText = view.state.sliceDoc(selection.from, selection.to);

        // Check if current selection matches find text
        const regex = buildSearchRegex(findText);
        if (!regex) return;

        if (regex.test(selectedText)) {
            view.dispatch({
                changes: { from: selection.from, to: selection.to, insert: replaceText },
                selection: { anchor: selection.from + replaceText.length },
            });

            // Find next match after replacing
            setTimeout(() => findNext(), 10);
        } else {
            // No match selected, find next
            findNext();
        }
    }

    function replaceAll() {
        if (!findText) return;

        if (searchScope === "current") {
            replaceAllInCurrentDocument();
        } else {
            replaceAllInAllDocuments();
        }
    }

    function replaceAllInCurrentDocument() {
        if (!editorView) return;

        const view = editorView.getView?.();
        if (!view) return;

        const doc = view.state.doc;
        const text = doc.toString();
        const regex = buildSearchRegex(findText);
        if (!regex) return;

        const newText = text.replace(regex, replaceText);

        view.dispatch({
            changes: { from: 0, to: doc.length, insert: newText },
        });

        currentMatches = 0;
    }

    function replaceAllInAllDocuments() {
        const regex = buildSearchRegex(findText);
        if (!regex) return;

        let totalReplacements = 0;

        editorStore.tabs.forEach((tab) => {
            const matches = [...tab.content.matchAll(regex)];
            if (matches.length > 0) {
                const newContent = tab.content.replace(regex, replaceText);
                tab.content = newContent;
                totalReplacements += matches.length;
            }
        });

        alert(`Replaced ${totalReplacements} occurrences across ${editorStore.tabs.length} documents`);
        findInAllDocuments();
    }

    function findInAllDocuments() {
        if (!findText) return;

        const regex = buildSearchRegex(findText);
        if (!regex) return;

        allTabsResults.clear();

        editorStore.tabs.forEach((tab) => {
            const matches = [...tab.content.matchAll(regex)];
            if (matches.length > 0) {
                allTabsResults.set(tab.id, matches.length);
            }
        });

        allTabsResults = new Map(allTabsResults);
    }

    function handleSearch() {
        if (searchScope === "current") {
            findInCurrentDocument();
        } else {
            findInAllDocuments();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.stopPropagation();
            close();
        } else if (e.key === "Enter") {
            if (e.shiftKey) {
                findPrevious();
            } else {
                if (isReplaceMode && e.ctrlKey) {
                    replaceAll();
                } else {
                    findNext();
                }
            }
        } else if ((e.key === "f" || e.key === "h") && (e.ctrlKey || e.metaKey)) {
            // Trap these to prevent browser find from activating while focused here
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "h") {
                isReplaceMode = true;
            }
            focusInput();
        }
    }

    function navigateToTab(tabId: string) {
        appState.activeTabId = tabId;
    }
</script>

{#if isOpen}
    <div class="find-replace-panel" onkeydown={handleKeydown} role="dialog" aria-label="Find and Replace" tabindex="-1">
        <div class="panel-header">
            <div class="flex items-center gap-2 flex-1">
                <button type="button" class="icon-btn" onclick={() => (isReplaceMode = !isReplaceMode)} title="Toggle Replace Mode">
                    {#if isReplaceMode}
                        <ChevronDown size={16} />
                    {:else}
                        <ChevronRight size={16} />
                    {/if}
                </button>
                <span class="font-semibold text-sm">Find {isReplaceMode ? "& Replace" : ""}</span>
            </div>
            <button type="button" class="icon-btn" onclick={close} title="Close (Esc)">
                <X size={16} />
            </button>
        </div>

        <div class="panel-content">
            <!-- Find Input -->
            <div class="input-row">
                <input bind:this={searchInputRef} type="text" bind:value={findText} placeholder="Find" class="search-input" oninput={handleSearch} />
                <div class="result-indicator">
                    {#if searchScope === "current"}
                        {#if currentMatches > 0}
                            {currentIndex + 1} of {currentMatches}
                        {:else if findText}
                            0 of 0
                        {/if}
                    {:else if searchScope === "all"}
                        {#if allTabsResults.size > 0}
                            {allTabsResults.size} tabs
                        {:else if findText}
                            0 tabs
                        {/if}
                    {/if}
                </div>
            </div>

            <!-- Replace Input -->
            {#if isReplaceMode}
                <div class="input-row">
                    <input type="text" bind:value={replaceText} placeholder="Replace" class="search-input" />
                </div>
            {/if}

            <!-- Options -->
            <div class="options-row">
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={matchCase} onchange={handleSearch} />
                    <span>Match Case</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={matchWholeWord} onchange={handleSearch} />
                    <span>Whole Word</span>
                </label>
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={useRegex} onchange={handleSearch} />
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
                <button type="button" class="action-btn" onclick={findPrevious} disabled={searchScope === "all"}>
                    <Search size={14} />
                    Previous
                </button>
                <button type="button" class="action-btn" onclick={findNext} disabled={searchScope === "all"}>
                    <Search size={14} />
                    Next
                </button>
                {#if isReplaceMode}
                    <button type="button" class="action-btn" onclick={replaceCurrentMatch} disabled={searchScope === "all"}>
                        <Replace size={14} />
                        Replace
                    </button>
                    <button type="button" class="action-btn" onclick={replaceAll}>
                        <Replace size={14} />
                        Replace All
                    </button>
                {/if}
            </div>

            <!-- All Tabs Results -->
            {#if searchScope === "all" && allTabsResults.size > 0}
                <div class="results-list">
                    <div class="results-header">Results:</div>
                    {#each [...allTabsResults.entries()] as [tabId, count]}
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
        background-color: var(--bg-panel);
        border: 1px solid var(--border-main);
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
        border-bottom: 1px solid var(--border-main);
        color: var(--fg-default);
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
        padding: 0.5rem;
        background-color: var(--bg-input);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        color: var(--fg-default);
        font-size: 0.875rem;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--accent-primary);
    }

    .result-indicator {
        font-size: 0.75rem;
        color: var(--fg-muted);
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
        font-size: 0.875rem;
        color: var(--fg-default);
        cursor: pointer;
    }

    .actions-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .icon-btn,
    .action-btn {
        padding: 0.375rem 0.75rem;
        background-color: var(--bg-hover);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        color: var(--fg-default);
        font-size: 0.875rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        transition: all 150ms;
    }

    .icon-btn:hover,
    .action-btn:hover {
        background-color: var(--bg-active);
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
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--fg-muted);
        margin-bottom: 0.25rem;
    }

    .result-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem;
        background-color: var(--bg-hover);
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 150ms;
        border: none;
        width: 100%;
        text-align: left;
    }

    .result-item:hover {
        background-color: var(--bg-active);
    }

    .result-filename {
        font-size: 0.875rem;
        color: var(--fg-default);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-count {
        font-size: 0.75rem;
        color: var(--fg-muted);
        background-color: var(--bg-panel);
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
    }
</style>
