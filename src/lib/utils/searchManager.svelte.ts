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
     * Updates highlighting and calculates stats.
     * Does NOT move the cursor or scroll.
     */
    updateEditor(view: EditorView | undefined) {
        if (!view) return;

        const query = this.getQuery();

        view.dispatch({
            effects: setSearchQuery.of(query)
        });

        this.calculateStats(view, query);
    }

    private calculateStats(view: EditorView, query: SearchQuery) {
        if (!this.findText) {
            this.currentMatches = 0;
            this.currentIndex = 0;
            return;
        }

        let count = 0;
        let idx = 0;
        const cursor = query.getCursor(view.state);
        // Use the selection HEAD to determine where we are
        const selectionHead = view.state.selection.main.head;
        const selectionFrom = view.state.selection.main.from;

        let item = cursor.next();
        while (!item.done) {
            // A match is "current" if it's the specific match selected in the editor.
            // If the selection range matches the item range, it's definitely the one.
            if (item.value.from === selectionFrom && item.value.to === selectionHead) {
                idx = count;
            }
            // Fallback: If we are just "at" the end of it (typical for some cursor movements)
            else if (item.value.from <= selectionHead && item.value.to >= selectionHead) {
                idx = count;
            }
            // Fallback 2: Count items before our cursor
            else if (item.value.to <= selectionFrom) {
                // We passed this match, so our index is at least this + 1
                // We hold this until we find an exact match or pass everything
                idx = count + 1;
            }

            count++;
            item = cursor.next();
        }

        if (idx >= count && count > 0) idx = 0; // Wrap around check

        this.currentMatches = count;
        this.currentIndex = count > 0 ? idx : 0;
    }

    /**
     * Finds the nearest match to the current cursor position and SELECTS it.
     * This ensures the "active" highlight styling is applied.
     */
    selectNearestMatch(view: EditorView | undefined) {
        if (!view || !this.findText) return;

        const query = this.getQuery();
        const cursor = query.getCursor(view.state);
        const currentPos = view.state.selection.main.from;

        let firstMatch = null;
        let bestMatch = null;

        let item = cursor.next();
        while (!item.done) {
            if (!firstMatch) firstMatch = item.value;

            // Check if this match is at or after our current cursor position
            // This includes matches we might be currently inside
            if (item.value.to >= currentPos) {
                bestMatch = item.value;
                break;
            }

            item = cursor.next();
        }

        const matchToSelect = bestMatch || firstMatch;

        if (matchToSelect) {
            view.dispatch({
                effects: setSearchQuery.of(query), // Ensure highlighters are active
                selection: { anchor: matchToSelect.from, head: matchToSelect.to },
                scrollIntoView: true
            });

            this.calculateStats(view, query);
        } else {
            this.updateEditor(view);
        }
    }

    clear(view: EditorView | undefined) {
        if (!view) return;
        view.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" }))
        });
        this.currentMatches = 0;
        this.currentIndex = 0;
    }

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

        this.searchAllTabs();
        return total;
    }

    private buildRegex(): RegExp | null {
        try {
            let pattern = this.findText;
            if (!this.useRegex) {
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
