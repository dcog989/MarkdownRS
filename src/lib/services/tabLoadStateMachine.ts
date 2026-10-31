import { appState } from "$lib/stores/appState.svelte";
import { computeWordCount } from "$lib/stores/editorCache";
import { editorStore, updateTransientState } from "$lib/stores/editorStore.svelte";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { callBackend } from "$lib/utils/backend";
import { hashContent, isTabDirty } from "$lib/utils/contentHash";
import { getEditorInstance } from "$lib/utils/editorCommands";
import { AppError } from "$lib/utils/errorHandling";
import { logger } from "$lib/utils/logger";
import { extractSmartTitle } from "$lib/utils/smartTitle";
import { byteLength, computeLineStats } from "$lib/utils/textMetrics";
import { formatDuration } from "$lib/utils/timing";
import type { AppEditorView } from "../../global";
import { normalizeLineEndings } from "./fileMetadata";

const contentLoadPromises = new Map<string, Promise<boolean>>();

/** Resolves true when the disk copy was read and reconciled with the tab. */
export async function loadTabContentLazy(tabId: string): Promise<boolean> {
  const tab = editorStore.tabs.find((t) => t.id === tabId);
  if (!tab || tab.contentLoaded) {
    return false;
  }

  // The AppLifecycle effect, saveFile, and tab reopen can all race to load the
  // same tab. Coalesce into a single in-flight load so awaiting callers wait
  // for the real result instead of returning early.
  const pending = contentLoadPromises.get(tabId);
  if (pending) return pending;

  const loadPromise = loadTabContentInternal(tabId);
  contentLoadPromises.set(tabId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    if (contentLoadPromises.get(tabId) === loadPromise) {
      contentLoadPromises.delete(tabId);
    }
  }
}

export async function waitForTabContentLoad(tabId: string): Promise<boolean> {
  const tab = editorStore.tabs.find((t) => t.id === tabId);
  if (!tab) return false;
  if (tab.contentLoaded) return true;

  await loadTabContentLazy(tabId);

  return editorStore.tabs.find((t) => t.id === tabId)?.contentLoaded ?? false;
}

async function loadTabContentInternal(tabId: string): Promise<boolean> {
  const start = performance.now();

  const tab = editorStore.tabs.find((t) => t.id === tabId);
  if (!tab) {
    logger.session.debug("TabClosedDuringLoad", { tabId });
    return false;
  }

  try {
    const data = await callBackend("load_tab_content", { tabId }, "Session:Load");

    const currentActiveId = appState.activeTabId;
    const isVisibleInPane = appState.paneTabs[0] === tabId || appState.paneTabs[1] === tabId;
    if (currentActiveId !== tabId && !isVisibleInPane) {
      logger.session.debug("TabSwitchedDuringLoad", { tabId, currentActiveId });
      return false;
    }

    let normalizedContent = "";
    let lastSavedHash = "";
    let diskEncoding: string | null = null;
    let diskHasBom: boolean | null = null;
    let diskContentVerified = false;

    if (data && data.content !== null && data.content !== undefined && data.content !== "") {
      normalizedContent = normalizeLineEndings(data.content);
      logger.session.debug("ContentLoadedFromDb", {
        tabId,
        contentLength: normalizedContent.length,
        path: tab.path,
      });

      if (!tab.path) {
        lastSavedHash = "";
      } else {
        try {
          const fileData = await callBackend("read_text_file", { path: tab.path }, "File:Read");
          if (fileData?.content) {
            diskEncoding = fileData.encoding;
            diskHasBom = fileData.has_bom;
            const diskContent = normalizeLineEndings(fileData.content);
            lastSavedHash = hashContent(diskContent);
            diskContentVerified = true;
            // A clean tab's truth is the file on disk. If the stored session
            // content no longer matches (e.g. the file changed externally
            // while the app was closed, or its content was skipped from the
            // session), disk wins — otherwise a save could overwrite newer
            // on-disk changes with the stale snapshot.
            if (!tab.isDirty && diskContent !== normalizedContent) {
              normalizedContent = diskContent;
            }
          } else {
            lastSavedHash = hashContent(normalizedContent);
          }
        } catch {
          lastSavedHash = hashContent(normalizedContent);
        }
      }
    } else {
      logger.session.warn("NoContentInDatabase", {
        tabId,
        path: tab.path,
        hasData: !!data,
        contentLength: data?.content?.length ?? 0,
      });
      normalizedContent = "";
      lastSavedHash = "";
    }

    const currentIndex = editorStore.tabs.findIndex((t) => t.id === tabId);
    let sizeBytes = 0;
    let wordCount = 0;
    if (currentIndex !== -1) {
      const currentTab = editorStore.tabs[currentIndex];

      // Restored tabs start with an empty placeholder, so any content that
      // appeared while the load was in flight (user edits — possibly not yet
      // debounced into the store — or a disk reload) must win over the stored
      // session content instead of being clobbered by it.
      // Only trust the registered view when it still shows this tab; a stale
      // entry from a previous tab would hand us another document's text.
      const view = getEditorInstance(tabId) as AppEditorView | undefined;
      const viewText = view?._currentTabId === tabId ? view.state.doc.toString() : "";
      const alreadyHadContent = currentTab.content !== "" || viewText !== "";
      const content = alreadyHadContent ? viewText || currentTab.content : normalizedContent;

      if (alreadyHadContent) {
        // The kept content isn't in the DB yet; mark it changed so the next
        // persist writes it even if a concurrent save just reset the flag.
        updateTransientState(tabId, { contentChanged: true });
      }

      let title = currentTab.title;
      if (!currentTab.customTitle && settingsState.tabNameFromContent) {
        const smartTitle = extractSmartTitle(content);
        if (smartTitle) title = smartTitle;
      }

      sizeBytes = byteLength(content);
      wordCount = computeWordCount(content);
      const { lineCount, widestColumn } = computeLineStats(content);

      // In-place mutation (see updateContent) to avoid churning the tabs array.
      Object.assign(editorStore.tabs[currentIndex], {
        title,
        content,
        lastSavedHash,
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
        // The DB stores LF-normalized content, so the line ending must come
        // from the persisted `line_ending` (set during session restore) rather
        // than being inferred from the normalized text.
        lineEnding: currentTab.lineEnding,
        encoding: diskEncoding ? diskEncoding.toUpperCase() : currentTab.encoding,
        hasBom: diskHasBom ?? currentTab.hasBom,
        contentLoaded: true,
        isDirty: isTabDirty({ path: currentTab.path, content, lastSavedHash }),
      });

      logger.session.debug("TabContentLoaded", {
        tabId,
        sizeBytes,
        wordCount,
        path: tab.path,
        keptPreLoadContent: alreadyHadContent,
      });
    }

    logger.session.debug("TabContentLazyLoaded", {
      duration: formatDuration(start),
      tabId,
      size: sizeBytes,
    });

    return diskContentVerified;
  } catch (err) {
    AppError.handle("Session:Load", err, {
      showToast: false,
      severity: "warning",
      additionalInfo: { tabId },
    });
  }

  return false;
}
