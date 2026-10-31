import { markdownLintState } from "$lib/utils/markdownLint.svelte";
import { spellcheckState } from "$lib/utils/spellcheck.svelte";
import { appState } from "./appState.svelte";
import { bookmarkStore } from "./bookmarkStore.svelte";
import { dialogStore } from "./dialogStore.svelte";
import { editorMetrics } from "./editorMetrics.svelte";
// The concrete store, not the `editorStore.svelte` barrel: `state` is reached
// through editorLifecycle -> fileMetadata while that barrel is still loading,
// and re-entering it there would hand this object an undefined editorStore.
import { editorStore } from "./editorStoreCore.svelte";
import { interfaceStore } from "./interfaceStore.svelte";
import { settingsState } from "./settingsState.svelte";
import { toastStore } from "./toastStore.svelte";
import { tooltipStore } from "./tooltipStore.svelte";

/**
 * Centralized State Tree
 * Groups all individual state objects for easier access and fewer imports.
 * Logic is handled by functions exported from individual store files.
 */
export const appContext = {
  app: appState,
  settings: settingsState,
  editor: editorStore,
  metrics: editorMetrics,
  bookmarks: bookmarkStore,
  interface: interfaceStore,
  spellcheck: spellcheckState,
  markdownLint: markdownLintState,
  ui: {
    tooltip: tooltipStore,
    toast: toastStore,
    dialog: dialogStore,
  },
};
