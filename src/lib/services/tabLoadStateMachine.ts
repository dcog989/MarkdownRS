import { appState } from '$lib/stores/appState.svelte';
import { computeWordCount } from '$lib/stores/editorCache';
import { editorStore } from '$lib/stores/editorStore.svelte';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { callBackend } from '$lib/utils/backend';
import { hashContent, isDirty } from '$lib/utils/contentHash';
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

const loadingRequests = new Map<string, number>();

export async function loadTabContentLazy(tabId: string): Promise<void> {
  const start = performance.now();
  const index = editorStore.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) {
    return;
  }

  const tab = editorStore.tabs[index];
  const currentState = tabLoadStates.get(tabId) ?? TabLoadState.UNLOADED;

  if (currentState === TabLoadState.LOADED || tab.contentLoaded) {
    return;
  }

  if (currentState === TabLoadState.LOADING) {
    return;
  }

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
      return;
    }

    let normalizedContent = '';
    let lastSavedHash = '';

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
            lastSavedHash = hashContent(normalizeLineEndings(fileData.content));
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

    const sizeBytes = byteLength(normalizedContent);
    const wordCount = computeWordCount(normalizedContent);
    const { lineCount, widestColumn } = computeLineStats(normalizedContent);

    const currentIndex = editorStore.tabs.findIndex((t) => t.id === tabId);
    if (currentIndex !== -1) {
      const currentTab = editorStore.tabs[currentIndex];

      let title = currentTab.title;
      if (!currentTab.customTitle && settingsState.tabNameFromContent) {
        const smartTitle = extractSmartTitle(normalizedContent);
        if (smartTitle) title = smartTitle;
      }

      editorStore.tabs[currentIndex] = {
        ...currentTab,
        title,
        content: normalizedContent,
        lastSavedHash,
        sizeBytes,
        wordCount,
        lineCount,
        widestColumn,
        lineEnding: normalizedContent.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
        contentLoaded: true,
        isDirty: isDirty(normalizedContent, lastSavedHash),
      };

      logger.session.info('TabContentLoaded', {
        tabId,
        sizeBytes,
        wordCount,
        path: tab.path,
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
