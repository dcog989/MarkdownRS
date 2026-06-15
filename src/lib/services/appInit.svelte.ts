import type { UnlistenFn } from '@tauri-apps/api/event';
import { addTab, editorStore } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { CONFIG } from '$lib/utils/config';
import { runFlushFunctions } from '$lib/utils/editorCommands';
import { loadSession, openFileByPath, persistSession, persistSessionDebounced } from '$lib/utils/fileSystem';
import { logger } from '$lib/utils/logger';
import { initSettings, saveSettings } from '$lib/utils/settings';
import { formatDuration } from '$lib/utils/timing';

export function createAppInit() {
  let isInitialized = $state(false);
  let initError = $state<string | null>(null);

  let timers: { autoSave: number | null } = { autoSave: null };

  async function initialize() {
    const appStartTime = performance.now();

    try {
      const settingsStart = performance.now();
      await initSettings();
      logger.editor.debug('SettingsInitialized', { duration: formatDuration(settingsStart) });

      const sessionStart = performance.now();
      await loadSession();
      logger.session.info('SessionRestored', { duration: formatDuration(sessionStart) });

      if (editorStore.tabs.length === 0) {
        const id = addTab();
        appContext.app.activeTabId = id;
      }

      logger.editor.info('AppInitialized', { duration: formatDuration(appStartTime) });

      isInitialized = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      initError = msg;
      isInitialized = true;
    }
  }

  function startSessionPersistence() {
    if (initError) return;
    timers.autoSave = window.setInterval(() => {
      if (editorStore.sessionDirty) {
        persistSession();
      }
      saveSettings();
    }, CONFIG.SESSION.AUTO_SAVE_INTERVAL_MS);
  }

  function stopSessionPersistence() {
    if (timers.autoSave !== null) {
      clearInterval(timers.autoSave);
      timers.autoSave = null;
    }
  }

  async function setupEventListeners(): Promise<() => void> {
    const { listen } = await import('@tauri-apps/api/event');

    const unlisteners: UnlistenFn[] = [];

    const unlisten1 = await listen<string>('open-file-from-args', async (event) => {
      await openFileByPath(event.payload);
    });
    unlisteners.push(unlisten1);

    const unlisten2 = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
      for (const path of event.payload.paths) {
        await openFileByPath(path);
      }
    });
    unlisteners.push(unlisten2);

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }

  function handleBlur() {
    persistSession();
    saveSettings();
  }

  function handleBeforeUnload() {
    persistSessionDebounced.clear();
    runFlushFunctions();
    persistSession();
    saveSettings();
  }

  function handleDestroy(isUnloading: boolean) {
    stopSessionPersistence();
    if (isInitialized && !initError && !isUnloading) {
      persistSessionDebounced.clear();
      persistSession();
      saveSettings();
    }
  }

  return {
    get isInitialized() {
      return isInitialized;
    },
    get initError() {
      return initError;
    },
    initialize,
    startSessionPersistence,
    setupEventListeners,
    handleBlur,
    handleBeforeUnload,
    handleDestroy,
  };
}
