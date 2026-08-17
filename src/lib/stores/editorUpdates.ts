import { hashContent, isDirty } from '$lib/utils/contentHash';
import { formatTimestampForDisplay, getCurrentTimestamp } from '$lib/utils/date';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { extractSmartTitle } from '$lib/utils/smartTitle';
import { byteLength, computeLineStats } from '$lib/utils/textMetrics';
import { computeWordCount, getLineChangeTracker, getTransientState, scheduleWordCountUpdate } from './editorCache';
import { editorStore, sortTabsPinnedFirst, updateTab } from './editorStoreCore.svelte';
import type { EditorTab } from './editorTypes';
import { settingsState } from './settingsState.svelte';

export function updateContent(id: string, content: string, lineCount: number) {
  const index = editorStore.tabs.findIndex((t) => t.id === id);
  if (index === -1) return;

  const oldTab = editorStore.tabs[index];
  if (oldTab.content === content) return;

  let newTitle = oldTab.title;
  if (settingsState.tabNameFromContent) {
    const smartTitle = extractSmartTitle(content);
    if (smartTitle) {
      newTitle = smartTitle;
    } else if (oldTab.originalTitle) {
      newTitle = oldTab.originalTitle;
    }
  }

  const now = getCurrentTimestamp();
  const sizeBytes = byteLength(content);

  scheduleWordCountUpdate(id, content);

  const ts = getTransientState(id);
  if (ts) ts.contentChanged = true;

  editorStore.tabs[index] = {
    ...oldTab,
    title: newTitle,
    content,
    isDirty: isDirty(content, oldTab.lastSavedHash),
    modified: now,
    formattedTimestamp: formatTimestampForDisplay(now),
    sizeBytes,
    lineCount,
    wordCountPending: true,
  };
  editorStore.sessionDirty = true;
}

export function updateScroll(id: string, percentage: number, scrollTop: number, topLine: number | undefined) {
  const ts = getTransientState(id);
  if (!ts) return;

  const isSignificant =
    Math.abs(ts.scrollPercentage - percentage) > 0.001 ||
    Math.abs(ts.scrollTop - scrollTop) > 0.5 ||
    (topLine !== undefined && Math.abs(ts.topLine - topLine) > 0.01);

  if (isSignificant) {
    ts.scrollPercentage = percentage;
    ts.scrollTop = scrollTop;
    if (topLine !== undefined) ts.topLine = topLine;
    editorStore.sessionDirty = true;
  }
}

export function updateCursor(id: string, anchor: number, head: number) {
  updateTab(
    id,
    (tab) => {
      if (tab.cursor.anchor !== anchor || tab.cursor.head !== head) {
        return { cursor: { anchor, head } };
      }
    },
    false,
  );
}

export function updateMetadata(id: string, created?: string, modified?: string) {
  updateTab(id, (tab) => {
    if (tab.created !== created || tab.modified !== modified) {
      const tsToFormat = modified || tab.modified || created || tab.created || '';
      return {
        created: created || tab.created,
        modified: modified || tab.modified,
        formattedTimestamp: formatTimestampForDisplay(tsToFormat),
      };
    }
  });
}

export function markAsSaved(id: string) {
  const now = getCurrentTimestamp();
  updateTab(id, (tab) => ({
    lastSavedHash: hashContent(tab.content),
    isDirty: false,
    modified: now,
    formattedTimestamp: formatTimestampForDisplay(now),
  }));
}

export function togglePin(id: string) {
  updateTab(id, (tab) => ({ isPinned: !tab.isPinned }));
  editorStore.tabs = sortTabsPinnedFirst(editorStore.tabs);
}

export function updateTabTitle(id: string, title: string, customTitle?: string) {
  updateTab(id, () => {
    const updates: Partial<EditorTab> = { title };
    if (customTitle !== undefined) {
      updates.customTitle = customTitle;
    }
    return updates;
  });
}

export function updateTabPath(id: string, path: string, title?: string) {
  updateTab(id, () => {
    const updates: Partial<EditorTab> = { path };
    if (title !== undefined) {
      updates.title = title;
    }
    return updates;
  });
}

export function updateTabFields(id: string, updates: Partial<EditorTab>) {
  updateTab(id, () => updates);
}

export function setFileCheckStatus(id: string, performed: boolean, failed: boolean) {
  const ts = getTransientState(id);
  if (ts) ts.fileCheckPerformed = performed;
  updateTab(id, () => ({ fileCheckFailed: failed }));
}

export function reloadTabContent(
  id: string,
  content: string,
  lineEnding: 'LF' | 'CRLF',
  encoding: string,
  sizeBytes: number,
  hasBom: boolean,
) {
  const { lineCount, widestColumn } = computeLineStats(content);

  const wordCount = computeWordCount(content);

  const ts = getTransientState(id);
  if (ts) {
    ts.fileCheckPerformed = false;
    ts.contentChanged = true;
  }

  // The whole document was replaced from disk; drop any tracked user edits so
  // stale recent-change highlights don't linger on unrelated lines.
  getLineChangeTracker(id).clear();

  updateTab(id, (tab) => ({
    content,
    lastSavedHash: hashContent(content),
    isDirty: false,
    lineEnding,
    encoding,
    sizeBytes,
    hasBom,
    wordCount,
    lineCount,
    widestColumn,
    wordCountPending: false,
    forceSync: (tab.forceSync ?? 0) + 1,
  }));
}

export function updateContentOnly(id: string, content: string, forceSync: boolean = false) {
  const ts = getTransientState(id);
  if (ts) ts.contentChanged = true;
  // A forced sync replaces the whole document (e.g. format-on-save). Recent
  // changes are kept: the view plugin remaps tracked lines through the change,
  // so markers persist as long as undo can still revert the edits.
  updateTab(id, (tab) => ({
    content,
    forceSync: forceSync ? (tab.forceSync ?? 0) + 1 : tab.forceSync,
  }));
}

export function saveTabComplete(
  id: string,
  path: string,
  title: string,
  lineEnding: 'LF' | 'CRLF',
  encoding: string,
  hasBom: boolean,
  sizeBytes: number,
) {
  const ts = getTransientState(id);
  if (ts) ts.fileCheckPerformed = false;
  updateTab(id, () => ({
    path,
    title,
    lineEnding,
    encoding,
    hasBom,
    sizeBytes,
    fileCheckFailed: false,
  }));
}

export function togglePreferredExtension(id: string) {
  updateTab(id, (tab) => {
    let current = tab.preferredExtension;
    if (!current) {
      if (tab.path) {
        current = isMarkdownFile(tab.path) ? 'md' : 'txt';
      } else {
        current = 'md';
      }
    }
    return { preferredExtension: current === 'md' ? 'txt' : 'md' };
  });
}

export function markTabPersisted(id: string) {
  const ts = getTransientState(id);
  if (ts) {
    ts.contentChanged = false;
    ts.isPersisted = true;
  }
}
