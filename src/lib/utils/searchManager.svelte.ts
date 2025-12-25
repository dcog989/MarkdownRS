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
        const selection = view.state.selection.main;

        // First pass: count total matches
        let item = cursor.next();
        while (!item.done) {
            count++;
            item = cursor.next();
        }

        // Second pass: find which match is currently selected
        // Use exact range matching - the selected match should have exactly the same from/to
        const cursorReset = query.getCursor(view.state);
        let matchIndex = 0;
        item = cursorReset.next();
        
        while (!item.done) {
            // Check if this match is exactly selected
            if (item.value.from === selection.from && item.value.to === selection.to) {
                idx = matchIndex;
                break;
            }
            // If no exact match found, check if cursor is within or before this match
            if (selection.head < item.value.from) {
                // Cursor is before this match, so current index is this match
                idx = matchIndex;
                break;
            }
            
            matchIndex++;
            item = cursorReset.next();
        }

        // If we went through all matches without finding where cursor is,
        // cursor is after the last match, so wrap to first
        if (matchIndex >= count && count > 0) {
            idx = 0;
        }

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
