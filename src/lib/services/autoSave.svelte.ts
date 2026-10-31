import { appContext } from "$lib/stores/state.svelte";
import { saveCurrentFile, withActiveTab } from "$lib/utils/fileSystem";
import { logger } from "$lib/utils/logger";

export function setupAutoSave() {
  const timers = new Map<string, number>();
  let disposeRoot: (() => void) | null = null;

  async function saveIfNeeded(tabId: string) {
    const tab = appContext.editor.tabs.find((t) => t.id === tabId);
    if (!tab?.isDirty || !tab.path) return;
    const saved = await withActiveTab(tabId, saveCurrentFile);
    if (saved) {
      logger.file.debug("AutoSaved", { path: tab.path });
    }
  }

  function clearTimers() {
    for (const timerId of timers.values()) clearTimeout(timerId);
    timers.clear();
  }

  function scheduleSave(tabId: string) {
    const existing = timers.get(tabId);
    if (existing !== undefined) {
      clearTimeout(existing);
      timers.delete(tabId);
    }

    const interval = appContext.settings.autoSaveInterval;
    const timeout = window.setTimeout(() => {
      timers.delete(tabId);
      void saveIfNeeded(tabId);
    }, interval * 1000);
    timers.set(tabId, timeout);
  }

  function start() {
    if (disposeRoot) return;
    // One timer per tab: switching away must not cancel the save the old tab is
    // already waiting for. Each timer restarts on that tab's own edits.
    disposeRoot = $effect.root(() => {
      $effect(() => {
        if (appContext.app.paneSyncSuspended) return;

        const activeTabId = appContext.app.activeTabId;
        const content = appContext.editor.tabs.find((t) => t.id === activeTabId)?.content;
        void content;

        if (appContext.settings.autoSaveInterval <= 0) {
          clearTimers();
        } else if (activeTabId) {
          scheduleSave(activeTabId);
        }
      });
    });
  }

  function stop() {
    clearTimers();
    disposeRoot?.();
    disposeRoot = null;
  }

  return { start, stop };
}
