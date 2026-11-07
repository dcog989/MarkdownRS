import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cancelPendingTooltips } from "$lib/actions/tooltip";
import { translate } from "$lib/i18n";
import { loadBookmarks } from "$lib/stores/bookmarkStore.svelte";
import { editorStore } from "$lib/stores/editorStore.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { hideTooltip } from "$lib/stores/tooltipStore.svelte";
import { runFlushFunctions } from "$lib/utils/editorCommands";
import { loadSession, openFile, persistSession, persistSessionDebounced } from "$lib/utils/fileSystem";
import { logger } from "$lib/utils/logger";
import { initSettings, saveSettings, saveSettingsNow } from "$lib/utils/settings";
import { formatDuration } from "$lib/utils/timing";

export function createAppInit() {
  let isInitialized = $state(false);
  let initError = $state<string | null>(null);

  let disposeSessionEffect: (() => void) | null = null;
  // Settings are only safe to write back once the file has been read; a failed
  // init must not overwrite it with defaults.
  let settingsReady = false;
  // True while the final save runs; further close requests are ignored.
  let closing = false;

  async function initialize() {
    const appStartTime = performance.now();

    try {
      // Bookmarks need no settings, so they load while the settings file is read.
      const bookmarksStart = performance.now();
      const bookmarks = loadBookmarks().then(() => {
        logger.editor.debug("BookmarksLoaded", { duration: formatDuration(bookmarksStart) });
      });

      const settingsStart = performance.now();
      // A failed read leaves defaults in memory; writing them back would
      // replace the user's file with those defaults.
      settingsReady = await initSettings();
      logger.editor.debug("SettingsInitialized", { duration: formatDuration(settingsStart) });

      const sessionStart = performance.now();
      await Promise.all([loadSession(), bookmarks]);
      logger.session.info("SessionRestored", { duration: formatDuration(sessionStart) });

      logger.editor.info("AppInitialized", { duration: formatDuration(appStartTime) });

      isInitialized = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      initError = msg;
      isInitialized = true;
      showToast("error", translate("app.startupFailed", { values: { error: msg } }));
    }
  }

  function startSessionPersistence() {
    if (disposeSessionEffect) return;
    // No idle timer: the session is written only after something changed, so an
    // untouched app performs no background work.
    disposeSessionEffect = $effect.root(() => {
      $effect(() => {
        if (editorStore.sessionDirty) persistSessionDebounced();
      });
    });
  }

  function stopSessionPersistence() {
    persistSessionDebounced.clear();
    disposeSessionEffect?.();
    disposeSessionEffect = null;
  }

  async function setupEventListeners(whenReady: Promise<void>): Promise<() => void> {
    const { listen } = await import("@tauri-apps/api/event");

    const unlisteners: UnlistenFn[] = [];

    const unlisten1 = await listen<string>("open-file-from-args", async (event) => {
      await openFile(event.payload);
    });
    unlisteners.push(unlisten1);

    const unlisten2 = await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
      // A drop during startup must not be overwritten by the session restore.
      await whenReady;
      for (const path of event.payload.paths) {
        await openFile(path);
      }
    });
    unlisteners.push(unlisten2);

    // WebKitGTK can skip the page's mouseleave when the pointer leaves the
    // window, so drop pending and visible tooltips and replay the leave on the
    // stale :hover chain, which resets JS-driven hover state (peek edge,
    // minimap) that CSS alone can't clear.
    const unlisten3 = await listen("window-cursor-left", () => {
      cancelPendingTooltips();
      hideTooltip();
      for (const el of document.querySelectorAll<HTMLElement>(":hover")) {
        el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, cancelable: true, relatedTarget: null }));
      }
    });
    unlisteners.push(unlisten3);

    // Closing the window must wait for the final session and settings write:
    // the async IPC is not guaranteed to finish if the webview is torn down.
    unlisteners.push(await getCurrentWindow().onCloseRequested(handleCloseRequested));

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }

  function handleBlur() {
    cancelPendingTooltips();
    hideTooltip();
    persistSession();
    if (settingsReady) saveSettings();
  }

  function handleBeforeUnload() {
    persistSessionDebounced.clear();
    runFlushFunctions();
    persistSession();
    if (settingsReady) saveSettingsNow();
  }

  async function handleCloseRequested(event: { preventDefault: () => void }): Promise<void> {
    // Every request is answered explicitly below, so an extra click while the
    // save runs cannot destroy the window before the write finishes.
    event.preventDefault();
    if (closing) return;

    closing = true;
    try {
      persistSessionDebounced.clear();
      runFlushFunctions();
      // Wait out an in-flight save, then persist the content flushed above.
      await persistSession();
      if (editorStore.sessionDirty) await persistSession();
      if (settingsReady) await saveSettingsNow();
    } finally {
      await getCurrentWindow().destroy();
    }
  }

  function handleDestroy(isUnloading: boolean) {
    stopSessionPersistence();
    if (isInitialized && !initError && !isUnloading) {
      persistSessionDebounced.clear();
      persistSession();
      if (settingsReady) saveSettingsNow();
    }
  }

  return {
    get isInitialized() {
      return isInitialized;
    },
    initialize,
    startSessionPersistence,
    setupEventListeners,
    handleBlur,
    handleBeforeUnload,
    handleDestroy,
  };
}
