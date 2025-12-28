import { appContext } from "$lib/stores/state.svelte.ts";
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

        let item = cursor.next();
        while (!item.done) {
            count++;
            item = cursor.next();
        }

        const cursorReset = query.getCursor(view.state);
        let matchIndex = 0;
        item = cursorReset.next();

        while (!item.done) {
            if (item.value.from === selection.from && item.value.to === selection.to) {
                idx = matchIndex;
                break;
            }
            if (selection.head < item.value.from) {
                idx = matchIndex;
                break;
            }

            matchIndex++;
            item = cursorReset.next();
        }

        if (matchIndex >= count && count > 0) {
            idx = 0;
        }

        this.currentMatches = count;
        this.currentIndex = count > 0 ? idx : 0;
    }

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

            if (item.value.to >= currentPos) {
                bestMatch = item.value;
                break;
            }

            item = cursor.next();
        }

        const matchToSelect = bestMatch || firstMatch;

        if (matchToSelect) {
            view.dispatch({
                effects: setSearchQuery.of(query),
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

        appContext.editor.tabs.forEach((tab) => {
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

        appContext.editor.tabs.forEach((tab) => {
            const matches = [...tab.content.matchAll(regex)];
            if (matches.length > 0) {
                const newContent = tab.content.replace(regex, this.replaceText);
                appContext.editor.updateContent(tab.id, newContent);
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
