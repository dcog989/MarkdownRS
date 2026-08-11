import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { editorStore, setFileCheckStatus } from '$lib/stores/editorStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { hashContent, isDirty } from '$lib/utils/contentHash';
import { AppError } from '$lib/utils/errorHandling';
import {
  checkAndReloadIfChanged,
  checkFileExists,
  normalizeLineEndings,
  refreshMetadata,
  reloadFileContent,
} from './fileMetadata';
import { fileWatcher } from './fileWatcher';

export async function initializeTabFileState(tab: EditorTab): Promise<void> {
  if (!tab.path) {
    return;
  }

  try {
    await callBackend('get_file_metadata', { path: tab.path }, 'File:Metadata');
  } catch {
    setFileCheckStatus(tab.id, true, true);
    return;
  }

  if (!tab.isDirty) {
    const hasChanged = await checkAndReloadIfChanged(tab.id);
    if (hasChanged) {
      await reloadFileContent(tab.id);
    }
  }

  if (tab.isDirty) {
    try {
      const res = await callBackend('read_text_file', { path: tab.path }, 'File:Read');

      if (!res) {
        throw new Error('Failed to read file: null result');
      }

      const storeTab = editorStore.tabs.find((x) => x.id === tab.id);
      if (storeTab) {
        const normalizedContent = normalizeLineEndings(res.content);
        storeTab.lastSavedHash = hashContent(normalizedContent);
        storeTab.isDirty = isDirty(storeTab.content, storeTab.lastSavedHash);
        storeTab.encoding = res.encoding.toUpperCase();
        storeTab.hasBom = res.has_bom;
      }
    } catch (err) {
      AppError.handle('File:Read', err, {
        showToast: false,
        severity: 'warning',
        additionalInfo: { path: tab.path },
      });
    }
  }

  await refreshMetadata(tab.id, tab.path);
  await checkFileExists(tab.id);

  try {
    await fileWatcher.watch(tab.path);
  } catch (err) {
    AppError.handle('FileWatcher:Watch', err, {
      showToast: false,
      severity: 'warning',
      additionalInfo: { path: tab.path },
    });
  }
}
