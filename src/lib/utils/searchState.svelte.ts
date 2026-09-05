import { SvelteMap } from "svelte/reactivity";

export const searchState = $state({
  findText: "",
  replaceText: "",
  matchCase: false,
  matchWholeWord: false,
  useRegex: false,

  currentMatches: 0,
  currentIndex: 0,
  allTabsResults: new SvelteMap<string, number>(),

  regexError: null as string | null,
});
