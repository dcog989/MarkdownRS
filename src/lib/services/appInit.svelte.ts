import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { translate } from "$lib/i18n";
import { loadBookmarks } from "$lib/stores/bookmarkStore.svelte";
import { addTab, editorStore } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { activateHoverAtPoint, clearStuckHoverState, setCursorPosition } from "$lib/stores/tooltipStore.svelte";
import { CONFIG } from "$lib/utils/config";
import { runFlushFunctions } from "$lib/utils/editorCommands";
import { loadSession, openFile, persistSession, persistSessionDebounced } from "$lib/utils/fileSystem";
import { logger } from "$lib/utils/logger";
import { initSettings, saveSettings, saveSettingsNow } from "$lib/utils/settings";
import { formatDuration } from "$lib/utils/timing";

export function createAppInit() {
  let isInitialized = $state(false);
  let initError = $state<string | null>(null);

  let timers: { autoSave: number | null } = { autoSave: null };
  // Settings are only safe to write back once the file has been read; a failed
  // init must not overwrite it with defaults.
  let settingsReady = false;
  // True while the final save runs; further close requests are ignored.
  let closing = false;

  async function initialize() {
    const appStartTime = performance.now();

    try {
      // Bookmarks need no settings, so they load while the settings file is read.
      const bookmarks = loadBookmarks();

      const settingsStart = performance.now();
      await initSettings();
      settingsReady = true;
      logger.editor.debug("SettingsInitialized", { duration: formatDuration(settingsStart) });

      const sessionStart = performance.now();
      await Promise.all([loadSession(), bookmarks]);
      logger.session.info("SessionRestored", { duration: formatDuration(sessionStart) });

      if (editorStore.tabs.length === 0) {
        const id = addTab();
        appContext.app.activeTabId = id;
      }

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
    timers.autoSave = window.setInterval(() => {
      if (editorStore.sessionDirty) {
        persistSession();
      }
      if (settingsReady) saveSettings();
    }, CONFIG.SESSION.AUTO_SAVE_INTERVAL_MS);
  }

  function stopSessionPersistence() {
    if (timers.autoSave !== null) {
      clearInterval(timers.autoSave);
      timers.autoSave = null;
    }
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

    // GTK's leave-notify-event fires reliably on cursor exit, unlike
    // WebKitGTK's DOM mouseout/mouseleave.
    const unlisten3 = await listen("window-cursor-left", () => {
      clearStuckHoverState();
    });
    unlisteners.push(unlisten3);

    // GTK's enter-notify-event reports the cursor position on re-entry, where
    // WebKitGTK skips the initial mouseenter for the element under the cursor.
    const unlisten4 = await listen<[number, number]>("window-cursor-enter", (event) => {
      activateHoverAtPoint(event.payload[0], event.payload[1]);
    });
    unlisteners.push(unlisten4);

    // Closing the window must wait for the final session and settings write:
    // the async IPC is not guaranteed to finish if the webview is torn down.
    unlisteners.push(await getCurrentWindow().onCloseRequested(handleCloseRequested));

    // Track the cursor position so tooltips anchor to where the pointer is when
    // their show-delay elapses, not where it was when the element was entered.
    const handleCursorMove = (e: MouseEvent) => setCursorPosition(e.clientX, e.clientY);
    window.addEventListener("mousemove", handleCursorMove);

    return () => {
      window.removeEventListener("mousemove", handleCursorMove);
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
      saveSettingsNow();
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
