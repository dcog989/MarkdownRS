import { appContext } from '$lib/stores/state.svelte';
import { autoSaveCurrentFile } from '$lib/utils/fileSystem';
import { logger } from '$lib/utils/logger';

export function setupAutoSave() {
  let timerId: number | null = null;

  function start() {
    const enabled = appContext.settings.autoSaveEnabled;
    const interval = appContext.settings.autoSaveInterval;

    if (!enabled) return;

    const intervalMs = Math.max(5000, interval * 1000);
    timerId = window.setInterval(() => {
      const tabId = appContext.app.activeTabId;
      if (!tabId) return;
      const tab = appContext.editor.tabs.find((t) => t.id === tabId);
      if (!tab?.isDirty || !tab.path) return;
      autoSaveCurrentFile().then((saved) => {
        if (saved) {
          logger.file.info('AutoSaved', { path: tab.path });
        }
      });
    }, intervalMs);
  }

  function stop() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  return { start, stop };
}
