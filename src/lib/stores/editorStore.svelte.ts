/**
 * Editor state: reactive ($state) for UI, non-reactive (Map) for complex internals.
 *
 * Architecture:
 *  editorTypes.ts        — EditorTab, TabTransientState, ClosedTab
 *  editorStoreCore       — Reactive $state store, updateTab helper, performTextTransform
 *  editorCache.ts        — Non-reactive Maps + accessors (LineChangeTracker, transient, history, word count)
 *  editorLifecycle.ts    — addTab, closeTab, reopenClosedTab, pushToMru, reorderTabs
 *  editorUpdates.ts      — All tab mutation functions (content, cursor, metadata, etc.)
 */

export {
  getHistoryState,
  getLineChangeTracker,
  getTransientState,
  initTransientState,
  setLineChangeTracker,
  updateHistoryState,
  updateTransientState,
} from './editorCache';
export {
  addTab,
  closeTab,
  createNewFile,
  pushToMru,
  reopenClosedTab,
  reorderTabs,
} from './editorLifecycle';
export { editorStore, performTextTransform, tabsById } from './editorStoreCore.svelte';
export type { ClosedTab, EditorTab, TabTransientState } from './editorTypes';

export {
  markAsSaved,
  markTabPersisted,
  reloadTabContent,
  saveTabComplete,
  setFileCheckStatus,
  togglePin,
  togglePreferredExtension,
  updateContent,
  updateContentOnly,
  updateCursor,
  updateMetadata,
  updateScroll,
  updateTabFields,
  updateTabPath,
  updateTabTitle,
} from './editorUpdates';
