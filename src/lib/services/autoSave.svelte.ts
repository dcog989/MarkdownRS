import { appContext } from '$lib/stores/state.svelte';
import { autoSaveCurrentFile } from '$lib/utils/fileSystem';
import { logger } from '$lib/utils/logger';

export function setupAutoSave() {
  let timerId: number | null = null;
  let disposeRoot: (() => void) | null = null;

  function saveIfNeeded() {
    const tabId = appContext.app.activeTabId;
    if (!tabId) return;
    const tab = appContext.editor.tabs.find((t) => t.id === tabId);
    if (!tab?.isDirty || !tab.path) return;
    autoSaveCurrentFile().then((saved) => {
      if (saved) {
        logger.file.info('AutoSaved', { path: tab.path });
      }
    });
  }

  function scheduleSave() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }

    const interval = appContext.settings.autoSaveInterval;
    if (interval <= 0) return;

    timerId = window.setTimeout(() => {
      timerId = null;
      saveIfNeeded();
    }, interval * 1000);
  }

  function start() {
    if (disposeRoot) return;
    // Debounce on content: reset the timer whenever the active tab's content
    // changes, so the file is saved a fixed delay after the last edit instead
    // of on a fixed cadence.
    disposeRoot = $effect.root(() => {
      $effect(() => {
        const activeTabId = appContext.app.activeTabId;
        const content = appContext.editor.tabs.find((t) => t.id === activeTabId)?.content;
        void content;
        scheduleSave();
      });
    });
  }

  function stop() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    disposeRoot?.();
    disposeRoot = null;
  }

  return { start, stop };
}
