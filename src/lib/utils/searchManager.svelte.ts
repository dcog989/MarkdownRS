import { editorStore } from "$lib/stores/editorStore.svelte.ts";
import { SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";

export class SearchManager {
    findText = $state("");
    replaceText = $state("");
    matchCase = $state(false);
    matchWholeWord = $state(false);
    useRegex = $state(false);

    // Results state
    currentMatches = $state(0);
    currentIndex = $state(0);
    allTabsResults = $state<Map<string, number>>(new Map());

    constructor() { }

    /**
     * Build a CodeMirror SearchQuery object based on current state
     */
    getQuery(): SearchQuery {
        return new SearchQuery({
            search: this.findText,
            caseSensitive: this.matchCase,
            regexp: this.useRegex,
            wholeWord: this.matchWholeWord,
            replace: this.replaceText
        });
    }

    /**
     * Update the active editor view with the current search query
     * and calculate match statistics using CodeMirror's cursor
     */
    updateEditor(view: EditorView | undefined) {
        if (!view) return;

        const query = this.getQuery();

        // Dispatch query to CodeMirror to handle highlighting
        view.dispatch({
            effects: setSearchQuery.of(query)
        });

        // Calculate counts using CodeMirror's own logic
        if (!this.findText) {
            this.currentMatches = 0;
            this.currentIndex = 0;
            return;
        }

        let count = 0;
        let idx = 0;
        const cursor = query.getCursor(view.state);
        const selectionHead = view.state.selection.main.head;

        let item = cursor.next();
        while (!item.done) {
            // Check if this match is "current" (closest to or overlapping selection)
            if (item.value.from <= selectionHead) {
                idx = count;
            }
            count++;
            item = cursor.next();
        }

        this.currentMatches = count;
        this.currentIndex = count > 0 ? idx : 0;
    }

    /**
     * Clear search state in the editor
     */
    clear(view: EditorView | undefined) {
        if (!view) return;
        view.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" }))
        });
        this.currentMatches = 0;
        this.currentIndex = 0;
    }

    /**
     * Search across all tabs using a consistent Regex strategy
     */
    searchAllTabs() {
        if (!this.findText) {
            this.allTabsResults.clear();
            return;
        }

        const regex = this.buildRegex();
        if (!regex) return;

        const results = new Map<string, number>();

        editorStore.tabs.forEach((tab) => {
            const matches = [...tab.content.matchAll(regex)];
            if (matches.length > 0) {
                results.set(tab.id, matches.length);
            }
        });

        this.allTabsResults = results;
    }

    /**
     * replaceAll across all tabs
     */
    replaceAllInTabs(): number {
        const regex = this.buildRegex();
        if (!regex) return 0;

        let total = 0;

        editorStore.tabs.forEach((tab) => {
            const matches = [...tab.content.matchAll(regex)];
            if (matches.length > 0) {
                const newContent = tab.content.replace(regex, this.replaceText);
                editorStore.updateContent(tab.id, newContent);
                total += matches.length;
            }
        });

        // Refresh search results
        this.searchAllTabs();
        return total;
    }

    /**
     * Internal regex builder that mimics CodeMirror's non-regex behavior
     */
    private buildRegex(): RegExp | null {
        try {
            let pattern = this.findText;
            if (!this.useRegex) {
                // Escape special regex characters
                pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }

            if (this.matchWholeWord) {
                pattern = `\\b${pattern}\\b`;
            }

            const flags = this.matchCase ? "g" : "gi";
            return new RegExp(pattern, flags);
        } catch (e) {
            return null;
        }
    }
}

export const searchManager = new SearchManager();
