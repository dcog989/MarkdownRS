import { SearchQuery, setSearchQuery } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { SvelteMap } from 'svelte/reactivity';
import { translate } from '$lib/i18n';
import { updateContent } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { searchState } from './searchState.svelte';

export { searchState };

export function getSearchQuery(): SearchQuery {
  if (searchState.useRegex && searchState.findText) {
    try {
      new RegExp(searchState.findText);
      searchState.regexError = null;
    } catch (e) {
      searchState.regexError = e instanceof Error ? e.message : translate('findReplace.invalidRegex');
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
  let found = false;

  const cursor = query.getCursor(view.state);
  const selection = view.state.selection.main;

  let item = cursor.next();
  while (!item.done) {
    if (!found) {
      if (item.value.from === selection.from && item.value.to === selection.to) {
        idx = count;
        found = true;
      } else if (selection.head < item.value.from) {
        idx = count;
        found = true;
      }
    }
    count++;
    item = cursor.next();
  }

  if (!found && count > 0) {
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

  const results = new SvelteMap<string, number>();

  appContext.editor.tabs.forEach((tab) => {
    const matches = [...tab.content.matchAll(regex)];
    if (matches.length > 0) {
      results.set(tab.id, matches.length);
    }
  });

  searchState.allTabsResults.clear();
  results.forEach((value, key) => {
    searchState.allTabsResults.set(key, value);
  });
}

export function replaceAllInTabs(): number {
  const regex = buildSearchRegex();
  if (!regex) return 0;

  let total = 0;

  appContext.editor.tabs.forEach((tab) => {
    const matches = [...tab.content.matchAll(regex)];
    if (matches.length > 0) {
      const newContent = tab.content.replace(regex, searchState.replaceText);
      updateContent(tab.id, newContent, newContent.split('\n').length);
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

    searchState.regexError = null;
    return regex;
  } catch (e) {
    if (searchState.useRegex && searchState.findText) {
      searchState.regexError = e instanceof Error ? e.message : translate('findReplace.invalidRegex');
    } else {
      searchState.regexError = null;
    }
    return null;
  }
}
