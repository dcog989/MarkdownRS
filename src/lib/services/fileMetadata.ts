import { translate } from '$lib/i18n';
import { reloadTabContent, setFileCheckStatus, updateMetadata } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { callBackendSafe } from '$lib/utils/backend';
import { hashContent } from '$lib/utils/contentHash';
import { logger } from '$lib/utils/logger';
import { byteLength, detectLineEnding } from '$lib/utils/textMetrics';

export type FileContent = {
  content: string;
  encoding: string;
};

type FileMetadata = {
  created?: string;
  modified?: string;
  size: number;
};

const metadataCache = new Map<string, { expires: number; promise: Promise<FileMetadata> }>();
const CACHE_TTL_MS = 500;

async function getCachedFileMetadata(path: string): Promise<FileMetadata> {
  const now = Date.now();
  const cached = metadataCache.get(path);

  if (cached && now < cached.expires) {
    return cached.promise;
  }

  const promise = callBackendSafe('get_file_metadata', { path }, 'File:Metadata').then((result) => {
    if (!result) {
      throw new Error('Failed to get file metadata: null result');
    }
    return result;
  });
  metadataCache.set(path, { expires: now + CACHE_TTL_MS, promise });

  return promise;
}

export function invalidateMetadataCache(path: string) {
  metadataCache.delete(path);
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function sanitizePath(path: string): string {
  return path.replace(/\0/g, '').replace(/\\/g, '/');
}

export async function refreshMetadata(tabId: string, path: string): Promise<void> {
  try {
    const meta = await getCachedFileMetadata(path);
    updateMetadata(tabId, meta.created, meta.modified);
  } catch {
    logger.file.warn('RefreshMetadataFailed', { path });
  }
}

export async function checkFileExists(tabId: string): Promise<void> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return;

  const result = await callBackendSafe('get_file_metadata', { path: tab.path }, 'File:Metadata', {
    showToast: false,
    severity: 'warning',
    additionalInfo: { path: tab.path, tabId },
    onError: () => {
      setFileCheckStatus(tabId, true, true);
    },
  });

  if (result) {
    setFileCheckStatus(tabId, true, false);
  }
}

export async function hasFileChanged(tabId: string): Promise<boolean> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return false;

  const meta = await callBackendSafe('get_file_metadata', { path: tab.path }, 'File:Metadata', {
    showToast: false,
    severity: 'warning',
    additionalInfo: { path: tab.path, tabId },
    onError: () => {
      setFileCheckStatus(tabId, true, true);
    },
  });

  if (!meta) return false;

  // The mtime/size fast paths are only valid for clean tabs, whose `modified`
  // and `sizeBytes` reflect the on-disk state (set from the backend on
  // load/save). A dirty tab's `modified`/`sizeBytes` are its last-edit state,
  // so comparing them against the disk would report a change spuriously.
  if (!tab.isDirty) {
    // mtime is formatted at second granularity, so a differing stamp reliably
    // signals a cross-second edit without a file read.
    if (tab.modified && meta.modified && meta.modified !== tab.modified) {
      return true;
    }

    if (tab.sizeBytes !== undefined && meta.size !== tab.sizeBytes) {
      return true;
    }
  }

  // Same-second edits (or a missing tab.modified) are invisible to mtime, so
  // compare the file content against the last saved hash. lastSavedHash is the
  // on-disk baseline even for dirty tabs.
  const file = await callBackendSafe('read_text_file', { path: tab.path }, 'File:Read', {
    showToast: false,
    severity: 'warning',
    additionalInfo: { path: tab.path, tabId },
    onError: () => {
      setFileCheckStatus(tabId, true, true);
    },
  });
  if (!file) return false;

  return hashContent(normalizeLineEndings(file.content)) !== tab.lastSavedHash;
}

export async function checkAndReloadIfChanged(tabId: string): Promise<boolean> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return false;

  if (tab.isDirty) return false;

  return hasFileChanged(tabId);
}

export async function reloadFileContent(tabId: string): Promise<void> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return;

  const sanitizedPath = sanitizePath(tab.path);
  const result = await callBackendSafe('read_text_file', { path: sanitizedPath }, 'File:Read', {
    userMessage: translate('fileOps.failedReload'),
    additionalInfo: { path: tab.path, tabId },
  });

  if (!result) return;

  const detectedLineEnding = detectLineEnding(result.content);

  const content = normalizeLineEndings(result.content);
  const sizeBytes = byteLength(result.content);

  reloadTabContent(tabId, content, detectedLineEnding, result.encoding.toUpperCase(), sizeBytes);

  await refreshMetadata(tabId, sanitizedPath);
}
