import type { OperationId } from '$lib/config/textOperationsRegistry';
import { appState } from './appState.svelte';
import type { ClosedTab, EditorTab } from './editorTypes';

export const editorStore = $state({
  tabs: [] as EditorTab[],
  sessionDirty: false,
  mruStack: [] as string[],
  closedTabsHistory: [] as ClosedTab[],
  lastScrollSource: null as 'editor' | 'preview' | null,
  pendingTransform: null as { tabId: string; op: OperationId; timestamp: number } | null,
});

export function updateTab(
  id: string,
  updater: (tab: EditorTab) => Partial<EditorTab> | undefined,
  markDirty: boolean = true,
): boolean {
  const index = editorStore.tabs.findIndex((t) => t.id === id);
  if (index === -1) return false;

  const tab = editorStore.tabs[index];
  const updates = updater(tab);

  if (updates) {
    Object.assign(editorStore.tabs[index], updates);
  }

  if (markDirty) {
    editorStore.sessionDirty = true;
  }

  return true;
}

export function performTextTransform(operationId: OperationId) {
  const activeId = appState.activeTabId;

  if (activeId) {
    editorStore.pendingTransform = {
      tabId: activeId,
      op: operationId,
      timestamp: Date.now(),
    };
  }
}
