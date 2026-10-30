import { createNewFile } from "$lib/stores/editorStore.svelte";
import { appState } from "./appState.svelte";
import { editorStore } from "./editorStoreCore.svelte";

export function isSplitPaneActive(): boolean {
  return appState.paneTabs[1] !== null;
}

export function focusPane(index: 0 | 1): void {
  const tabId = appState.paneTabs[index];
  if (!tabId || appState.activePane === index) return;
  appState.activePane = index;
  appState.activeTabId = tabId;
}

export async function toggleSplitPane(): Promise<void> {
  if (isSplitPaneActive()) {
    appState.paneTabs[1] = null;
    appState.activePane = 0;
    if (appState.paneTabs[0]) appState.activeTabId = appState.paneTabs[0];
    return;
  }

  const current = appState.activeTabId;
  if (!current) return;

  appState.paneTabs[0] = current;
  appState.activePane = 0;
  const other = editorStore.mruStack.find((id) => id !== current) ?? editorStore.tabs.find((t) => t.id !== current)?.id;
  appState.paneTabs[1] = other ?? (await createNewFile());
}

/** Drop a closed tab from whichever pane showed it. */
export function clearPaneTab(id: string): void {
  if (appState.paneTabs[0] === id) appState.paneTabs[0] = null;
  if (appState.paneTabs[1] === id) appState.paneTabs[1] = null;
}

/**
 * Restore the invariant after a close: the primary pane always holds a tab and
 * the split only survives while both panes do.
 */
export function settlePanesAfterClose(): void {
  const [primary, secondary] = appState.paneTabs;

  if (secondary === null) {
    appState.activePane = 0;
    if (primary) appState.activeTabId = primary;
    return;
  }

  if (primary === null) {
    appState.paneTabs[0] = secondary;
    appState.paneTabs[1] = null;
    appState.activePane = 0;
    appState.activeTabId = secondary;
  }
}
