import { translate } from "$lib/i18n";
import { reloadTabContent, setFileCheckStatus, updateMetadata } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { callBackendSafe } from "$lib/utils/backend";
import { hashContent } from "$lib/utils/contentHash";
import { logger } from "$lib/utils/logger";
import { byteLength, detectLineEnding } from "$lib/utils/textMetrics";

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

  const promise = callBackendSafe("get_file_metadata", { path }, "File:Metadata").then((result) => {
    if (!result) {
      throw new Error("Failed to get file metadata: null result");
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
  return text.replace(/\r\n/g, "\n");
}

export function sanitizePath(path: string): string {
  return path.replace(/\0/g, "").replace(/\\/g, "/");
}

export async function refreshMetadata(tabId: string, path: string): Promise<void> {
  try {
    const meta = await getCachedFileMetadata(path);
    updateMetadata(tabId, meta.created, meta.modified);
  } catch {
    logger.file.warn("RefreshMetadataFailed", { path });
  }
}

export async function checkFileExists(tabId: string): Promise<void> {
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.path) return;

  const result = await callBackendSafe("get_file_metadata", { path: tab.path }, "File:Metadata", {
    showToast: false,
    severity: "warning",
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

  const meta = await callBackendSafe("get_file_metadata", { path: tab.path }, "File:Metadata", {
    showToast: false,
    severity: "warning",
    additionalInfo: { path: tab.path, tabId },
    onError: () => {
      setFileCheckStatus(tabId, true, true);
    },
  });

  if (!meta) return false;

  // mtime/size are second-granularity hints, not proof of an external edit.
  // tab.modified is also stamped from the frontend clock on edits and keeps a
  // fresh timestamp even when the content is reverted back to the saved text
  // (e.g. undo), so a clean tab's `modified` can differ from the disk mtime
  // without the file having changed. Trusting a metadata difference would
  // spuriously warn "file changed on disk" on a plain re-save. The on-disk
  // content compared against the last-saved hash is the authoritative check,
  // so it runs for every tab, clean or dirty. lastSavedHash is the on-disk
  // baseline even for dirty tabs: a dirty tab whose disk baseline still
  // matches returns false (no external edit), while one whose disk changed
  // returns true (the save would overwrite someone else's edit).
  const file = await callBackendSafe("read_text_file", { path: tab.path }, "File:Read", {
    showToast: false,
    severity: "warning",
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
  const result = await callBackendSafe("read_text_file", { path: sanitizedPath }, "File:Read", {
    userMessage: translate("fileOps.failedReload"),
    additionalInfo: { path: tab.path, tabId },
  });

  if (!result) return;

  const detectedLineEnding = detectLineEnding(result.content);

  const content = normalizeLineEndings(result.content);

  // The decoded content's byte length (UTF-8) only matches the on-disk size
  // for BOM-less UTF-8 files; read the real metadata so the size fast path and
  // status bar reflect the actual file (BOM and non-UTF-8 encodings included).
  const meta = await callBackendSafe("get_file_metadata", { path: sanitizedPath }, "File:Metadata", {
    showToast: false,
    severity: "warning",
  });
  const sizeBytes = meta?.size ?? byteLength(result.content);

  reloadTabContent(tabId, content, detectedLineEnding, result.encoding.toUpperCase(), sizeBytes, result.has_bom);

  invalidateMetadataCache(sanitizedPath);
  await refreshMetadata(tabId, sanitizedPath);
}
