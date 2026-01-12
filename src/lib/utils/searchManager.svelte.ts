import { updateContent } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView } from '@codemirror/view';

// State
export const searchState = $state({
    findText: '',
    replaceText: '',
    matchCase: false,
    matchWholeWord: false,
    useRegex: false,

    // Results
    currentMatches: 0,
    currentIndex: 0,
    allTabsResults: new Map<string, number>(),

    // Validation
    regexError: null as string | null,
});

export function getSearchQuery(): SearchQuery {
    if (searchState.useRegex && searchState.findText) {
        try {
            new RegExp(searchState.findText);
            searchState.regexError = null;
        } catch (e) {
            searchState.regexError = e instanceof Error ? e.message : 'Invalid regex pattern';
            // Return a safe non-regex query to prevent CodeMirror internal crashes
            return new SearchQuery({
                search: '',
                caseSensitive: searchState.matchCase,
                wholeWord: searchState.matchWholeWord,
            });
        }
    } else {
        searchState.regexError = null;
    }

    return new SearchQuery({
        search: searchState.findText,
        caseSensitive: searchState.matchCase,
        regexp: searchState.useRegex,
        wholeWord: searchState.matchWholeWord,
        replace: searchState.replaceText,
    });
}

export function updateSearchEditor(view: EditorView | undefined) {
    if (!view) return;

    const query = getSearchQuery();

    view.dispatch({
        effects: setSearchQuery.of(query),
    });

    calculateSearchStats(view, query);
}

function calculateSearchStats(view: EditorView, query: SearchQuery) {
    if (!searchState.findText) {
        searchState.currentMatches = 0;
        searchState.currentIndex = 0;
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

    searchState.currentMatches = count;
    searchState.currentIndex = count > 0 ? idx : 0;
}

export function selectNearestMatch(view: EditorView | undefined) {
    if (!view || !searchState.findText) return;

    const query = getSearchQuery();
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
            scrollIntoView: true,
        });

        calculateSearchStats(view, query);
    } else {
        updateSearchEditor(view);
    }
}

export function clearSearch(view: EditorView | undefined) {
    if (!view) return;
    view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: '' })),
    });
    searchState.currentMatches = 0;
    searchState.currentIndex = 0;
    searchState.regexError = null;
}

export function searchAllTabs() {
    if (!searchState.findText) {
        searchState.allTabsResults.clear();
        return;
    }

    const regex = buildSearchRegex();
    if (!regex) return;

    const results = new Map<string, number>();

    appContext.editor.tabs.forEach((tab) => {
        const matches = [...tab.content.matchAll(regex)];
        if (matches.length > 0) {
            results.set(tab.id, matches.length);
        }
    });

    searchState.allTabsResults = results;
}

export function replaceAllInTabs(): number {
    const regex = buildSearchRegex();
    if (!regex) return 0;

    let total = 0;

    appContext.editor.tabs.forEach((tab) => {
        const matches = [...tab.content.matchAll(regex)];
        if (matches.length > 0) {
            const newContent = tab.content.replace(regex, searchState.replaceText);
            updateContent(tab.id, newContent);
            total += matches.length;
        }
    });

    searchAllTabs();
    return total;
}

function buildSearchRegex(): RegExp | null {
    try {
        let pattern = searchState.findText;
        if (!searchState.useRegex) {
            pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        if (searchState.matchWholeWord) {
            pattern = `\\b${pattern}\\b`;
        }

        const flags = searchState.matchCase ? 'g' : 'gi';
        const regex = new RegExp(pattern, flags);

        // Clear any previous error on success
        searchState.regexError = null;
        return regex;
    } catch (e) {
        // Set error message for user feedback
        if (searchState.useRegex && searchState.findText) {
            searchState.regexError = e instanceof Error ? e.message : 'Invalid regex pattern';
        } else {
            searchState.regexError = null;
        }
        return null;
    }
}
