<script lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { onDestroy, onMount } from "svelte";
import { _ } from "svelte-i18n";
import Logo from "$lib/components/ui/Logo.svelte";
import { createAppInit } from "$lib/services/appInit.svelte";
import { setupAutoSave } from "$lib/services/autoSave.svelte";
import { loadTabContentLazy } from "$lib/services/tabLoadStateMachine";
import type { EditorTab } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { logger } from "$lib/utils/logger";
import { mruCycling } from "$lib/utils/mruCycling.svelte";
import { formatDuration } from "$lib/utils/timing";

let { children } = $props();

const appInit = createAppInit();
const autoSave = setupAutoSave();

let isUnloading = false;
let previousTabId = $state<string | null>(null);

let activeTab = $derived(appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId));

$effect(() => {
  const tab = activeTab;
  const currentTabId = tab?.id || null;

  if (appInit.isInitialized && currentTabId && currentTabId !== previousTabId) {
    logger.editor.debug("TabSwitched", {
      from: previousTabId || "none",
      to: currentTabId,
      title: tab?.title || "unknown",
    });
    previousTabId = currentTabId;
  }

  if (tab && !tab.contentLoaded && appInit.isInitialized) {
    // Duration and outcome are logged by loadTabContentInternal; this effect can
    // re-run while the coalesced load is in flight, so it logs nothing itself.
    void loadTabContentLazy(tab.id).catch((err) =>
      logger.editor.warn("TabContentLoadFailed", { tabId: tab.id, error: String(err) }),
    );
  }
});

$effect(() => {
  const tab = activeTab;
  const path = tab?.path || "";
  const dirtyMarker = tab?.isDirty ? "*" : "";
  const appName = $_("app.name");
  const titleWithPath = $_("app.titleWithPath", { values: { path } });
  const title = path ? `${dirtyMarker}${titleWithPath}` : `${dirtyMarker}${appName}`;
  invoke("set_window_title", { title });
});

$effect(() => {
  autoSave.start();
  return () => autoSave.stop();
});

onMount(() => {
  // performance.now() is measured from webview navigation start, so this is
  // roughly the time from page load to the app component mounting.
  const mountStart = performance.now();
  logger.app.debug("WebviewMounted", { sinceNavigation: mountStart.toFixed(2) });

  let unlistenEvents: (() => void) | null = null;

  const initPromise = appInit.initialize();
  const listenersReady = appInit.setupEventListeners(initPromise).then((unlisten) => {
    unlistenEvents = unlisten;
  });

  initPromise.then(async () => {
    appInit.startSessionPersistence();
    // Tell the backend the session is restored and the listeners exist, so it
    // can hand over a file passed on the command line without a timer.
    await listenersReady;
    await emit("frontend-ready");
    logger.app.debug("FrontendReady", { duration: formatDuration(mountStart) });
    logger.startBatching();
  });

  const handleBlur = () => appInit.handleBlur();
  const handleBeforeUnload = () => {
    // beforeunload already persists the session; let onDestroy skip the
    // redundant persist.
    isUnloading = true;
    appInit.handleBeforeUnload();
  };

  window.addEventListener("blur", handleBlur);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("keydown", mruCycling.onKeyDown);
  window.addEventListener("keyup", mruCycling.onKeyUp);

  return () => {
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("keydown", mruCycling.onKeyDown);
    window.removeEventListener("keyup", mruCycling.onKeyUp);
    mruCycling.cleanup();
    if (unlistenEvents) unlistenEvents();
  };
});

onDestroy(() => {
  appInit.handleDestroy(isUnloading);
});
</script>

{#if !appInit.isInitialized}
  <div class="text-fg-default flex h-screen w-screen flex-col items-center justify-center">
    <Logo class="mb-4 h-16 w-16 animate-pulse opacity-50" />
    <p class="text-fg-muted text-ui">{$_("app.loading")}</p>
  </div>
{:else}
  {@render children()}
{/if}
