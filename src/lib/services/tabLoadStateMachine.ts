import { appState } from '$lib/stores/appState.svelte';
import { computeWordCount } from '$lib/stores/editorCache';
import { editorStore, updateTransientState } from '$lib/stores/editorStore.svelte';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { callBackend } from '$lib/utils/backend';
import { hashContent, isDirty } from '$lib/utils/contentHash';
import { getEditorInstance } from '$lib/utils/editorCommands';
import { AppError } from '$lib/utils/errorHandling';
import { logger } from '$lib/utils/logger';
import { extractSmartTitle } from '$lib/utils/smartTitle';
import { byteLength, computeLineStats } from '$lib/utils/textMetrics';
import { formatDuration } from '$lib/utils/timing';
import { normalizeLineEndings } from './fileMetadata';

enum TabLoadState {
  UNLOADED = 'UNLOADED',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  ERROR = 'ERROR',
}

const tabLoadStates = new Map<string, TabLoadState>();

export function initializeTabLoadState(tabId: string, contentLoaded: boolean = true): void {
  tabLoadStates.set(tabId, contentLoaded ? TabLoadState.LOADED : TabLoadState.UNLOADED);
}

function validateTransition(currentState: TabLoadState, nextState: TabLoadState): boolean {
  const validTransitions: Record<TabLoadState, TabLoadState[]> = {
    [TabLoadState.UNLOADED]: [TabLoadState.LOADING],
    [TabLoadState.LOADING]: [TabLoadState.LOADED, TabLoadState.ERROR],
    [TabLoadState.LOADED]: [],
    [TabLoadState.ERROR]: [TabLoadState.LOADING],
  };

  return validTransitions[currentState]?.includes(nextState) ?? false;
}

function setTabLoadState(tabId: string, state: TabLoadState): void {
  const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;
  if (!validateTransition(currentState, state)) {
    logger.session.warn('InvalidTabStateTransition', {
      tabId,
      from: currentState,
      to: state,
    });
    return;
  }

  tabLoadStates.set(tabId, state);
}

// LOADING is not a valid source for UNLOADED, so the transition validator would
// reject a partial-load reset. This unconditional reset marks a tab for retry after
// an interrupted load (e.g. the active tab changed mid-await).
function resetTabLoadState(tabId: string): void {
  tabLoadStates.set(tabId, TabLoadState.UNLOADED);
}

const loadingRequests = new Map<string, number>();
const contentLoadPromises = new Map<string, Promise<void>>();

export async function loadTabContentLazy(tabId: string): Promise<void> {
  const index = editorStore.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) {
    return;
  }

  const tab = editorStore.tabs[index];
  const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;

  if (currentState === TabLoadState.LOADED || tab.contentLoaded) {
    return;
  }

  // The AppLifecycle effect, saveFile, and tab reopen can all race to load the
  // same tab. Coalesce into a single in-flight load so awaiting callers wait
  // for the real result instead of returning early.
  if (currentState === TabLoadState.LOADING) {
    await contentLoadPromises.get(tabId);
    return;
  }

  const loadPromise = loadTabContentInternal(tabId);
  contentLoadPromises.set(tabId, loadPromise);
  try {
    await loadPromise;
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

  const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;

  if (currentState !== TabLoadState.LOADING) {
    await loadTabContentLazy(tabId);
  } else {
    const pending = contentLoadPromises.get(tabId);
    if (pending) await pending;
  }

  return editorStore.tabs.find((t) => t.id === tabId)?.contentLoaded ?? false;
}

async function loadTabContentInternal(tabId: string): Promise<void> {
  const start = performance.now();

  setTabLoadState(tabId, TabLoadState.LOADING);

  const requestId = Date.now();
  loadingRequests.set(tabId, requestId);

  try {
    const data = await callBackend('load_tab_content', { tabId }, 'Session:Load');

    if (loadingRequests.get(tabId) !== requestId) {
      return;
    }

    const currentActiveId = appState.activeTabId;
    if (currentActiveId !== tabId) {
      logger.session.debug('TabSwitchedDuringLoad', { tabId, currentActiveId });
      resetTabLoadState(tabId);
      return;
    }

    let normalizedContent = '';
    let lastSavedHash = '';
    let diskEncoding: string | null = null;
    let diskHasBom: boolean | null = null;

    if (data && data.content !== null && data.content !== undefined && data.content !== '') {
      normalizedContent = normalizeLineEndings(data.content);
      logger.session.debug('ContentLoadedFromDb', {
        tabId,
        contentLength: normalizedContent.length,
        path: tab.path,
      });

      if (!tab.path) {
        lastSavedHash = '';
      } else {
        try {
          const fileData = await callBackend('read_text_file', { path: tab.path }, 'File:Read');
          if (fileData?.content) {
            diskEncoding = fileData.encoding;
            diskHasBom = fileData.has_bom;
            const diskContent = normalizeLineEndings(fileData.content);
            lastSavedHash = hashContent(diskContent);
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
      logger.session.warn('NoContentInDatabase', {
        tabId,
        path: tab.path,
        hasData: !!data,
        contentLength: data?.content?.length ?? 0,
      });
      normalizedContent = '';
      lastSavedHash = '';
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
      const viewText = getEditorInstance(tabId)?.state.doc.toString() ?? '';
      const alreadyHadContent = currentTab.content !== '' || viewText !== '';
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

      editorStore.tabs[currentIndex] = {
        ...currentTab,
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
        isDirty: isDirty(content, lastSavedHash),
      };

      logger.session.info('TabContentLoaded', {
        tabId,
        sizeBytes,
        wordCount,
        path: tab.path,
        keptPreLoadContent: alreadyHadContent,
      });
    }

    setTabLoadState(tabId, TabLoadState.LOADED);

    logger.session.debug('TabContentLazyLoaded', {
      duration: formatDuration(start),
      tabId,
      size: sizeBytes,
    });
  } catch (err) {
    if (loadingRequests.get(tabId) === requestId) {
      setTabLoadState(tabId, TabLoadState.ERROR);

      AppError.handle('Session:Load', err, {
        showToast: false,
        severity: 'warning',
        additionalInfo: { tabId },
      });

      const currentIndex = editorStore.tabs.findIndex((t) => t.id === tabId);
      if (currentIndex !== -1) {
        editorStore.tabs[currentIndex].contentLoaded = false;
      }
    }
  } finally {
    if (loadingRequests.get(tabId) === requestId) {
      loadingRequests.delete(tabId);
    }
  }
}
