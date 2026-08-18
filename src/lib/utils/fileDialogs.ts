import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { translate } from '$lib/i18n';
import {
  checkFileExists,
  hasFileChanged,
  invalidateMetadataCache,
  normalizeLineEndings,
  refreshMetadata,
  sanitizePath,
} from '$lib/services/fileMetadata';
import { fileWatcher } from '$lib/services/fileWatcher';
import { waitForTabContentLoad } from '$lib/services/tabLoadStateMachine';
import { confirmDialog } from '$lib/stores/dialogStore.svelte';
import { computeWordCount } from '$lib/stores/editorCache';
import {
  addTab,
  markAsSaved,
  pushToMru,
  saveTabComplete,
  updateContentOnly,
  updateTabFields,
  updateTransientState,
} from '$lib/stores/editorStore.svelte';
import { addToFileHistory } from '$lib/stores/fileHistoryStore.svelte';
import { notifyFileSaved } from '$lib/stores/fileTreeStore.svelte';
import { settingsState } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { runFlushFunctions } from '$lib/utils/editorCommands';
import { AppError } from '$lib/utils/errorHandling';
import { logger } from '$lib/utils/logger';
import { extractSmartTitle } from '$lib/utils/smartTitle';
import { byteLength, computeLineStats, detectLineEnding } from '$lib/utils/textMetrics';
import { formatDuration } from '$lib/utils/timing';
import { getFileMetadata, readTextFile, resolveRelativePath, writeTextFile } from './fileIO';
import { getFilename, isMarkdownFile, SUPPORTED_TEXT_EXTENSIONS } from './fileValidation';
import { formatMarkdown } from './formatterRust';

export async function openFile(path?: string): Promise<void> {
  const start = performance.now();

  try {
    let targetPath = path;

    if (!targetPath) {
      const selected = await open({
        multiple: false,
        filters: [
          { name: translate('fileOps.textFilter'), extensions: SUPPORTED_TEXT_EXTENSIONS },
          { name: translate('fileOps.allFiles'), extensions: ['*'] },
        ],
      });
      if (!selected || typeof selected !== 'string') return;
      targetPath = selected;
    }

    const sanitizedPath = sanitizePath(targetPath);
    const existingTab = appContext.editor.tabs.find((t) => t.path === sanitizedPath);

    addToFileHistory(sanitizedPath);

    if (existingTab) {
      appContext.app.activeTabId = existingTab.id;
      pushToMru(existingTab.id);
      return;
    }

    const metadata = await getFileMetadata(sanitizedPath);

    const maxFileSizeMB = settingsState.maxFileSizeMB;
    const BYTES_PER_MB = 1024 * 1024;
    const maxBytes = maxFileSizeMB * BYTES_PER_MB;

    if (!metadata) {
      throw new Error(translate('fileOps.failedMetadata'));
    }

    if (metadata.size > maxBytes) {
      throw new Error(
        translate('fileOps.tooLarge', {
          values: { size: (metadata.size / BYTES_PER_MB).toFixed(2), max: maxFileSizeMB },
        }),
      );
    }

    const result = await readTextFile(sanitizedPath);

    if (!result) {
      throw new Error(translate('fileOps.failedReadNull'));
    }

    const fileName = getFilename(sanitizedPath) || translate('fileOps.untitled');

    const detectedLineEnding = detectLineEnding(result.content);

    let initialTitle = fileName;
    if (appContext.settings.tabNameFromContent) {
      const smartTitle = extractSmartTitle(result.content);
      if (smartTitle) initialTitle = smartTitle;
    }

    const id = addTab(initialTitle, result.content);

    const { lineCount, widestColumn } = computeLineStats(result.content);

    const initialWordCount = computeWordCount(result.content);

    updateTransientState(id, { fileCheckPerformed: false });
    updateTabFields(id, {
      path: sanitizedPath,
      isDirty: false,
      lineEnding: detectedLineEnding,
      encoding: result.encoding.toUpperCase(),
      hasBom: result.has_bom,
      sizeBytes: metadata.size,
      wordCount: initialWordCount,
      lineCount,
      widestColumn,
    });

    await refreshMetadata(id, sanitizedPath);
    await checkFileExists(id);
    await fileWatcher.watch(sanitizedPath);
    appContext.app.activeTabId = id;

    logger.file.info('FileOpened', {
      duration: formatDuration(start),
      path: sanitizedPath,
      size: metadata.size,
      encoding: result.encoding,
    });
  } catch (_err) {
    AppError.handle('File:Read', _err, {
      showToast: true,
      additionalInfo: { path },
    });
  }
}

export async function openFileByPath(path: string): Promise<void> {
  await openFile(path);
}

export async function navigateToPath(clickedPath: string): Promise<void> {
  const activeTab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);

  if (!clickedPath || clickedPath.length > 1024 || clickedPath.includes('\n')) {
    return;
  }

  try {
    const resolvedPath = await resolveRelativePath(activeTab?.path || null, clickedPath.replace(/\\/g, '/'));

    if (!resolvedPath) {
      return;
    }

    await openPath(resolvedPath);
  } catch (err) {
    logger.file.warn('NavigationFailed', { error: String(err) });
    showToast('error', translate('fileOps.failedOpen', { values: { error: String(err) } }));
  }
}

const activeSaves = new Map<string, boolean>();

export async function saveCurrentFile(skipFormat = false): Promise<boolean> {
  appContext.app.isTabSwitching = false;

  runFlushFunctions();
  return saveFile(false, skipFormat);
}

export async function saveCurrentFileAs(): Promise<boolean> {
  appContext.app.isTabSwitching = false;

  runFlushFunctions();
  return saveFile(true, false);
}

export async function autoSaveCurrentFile(): Promise<boolean> {
  const tabId = appContext.app.activeTabId;
  if (!tabId) return false;
  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  if (!tab?.isDirty || !tab.path) return false;
  return saveCurrentFile();
}

async function saveFile(forceNewPath: boolean, skipFormat = false): Promise<boolean> {
  const start = performance.now();
  const tabId = appContext.app.activeTabId;
  if (!tabId) return false;

  const getTab = () => appContext.editor.tabs.find((t) => t.id === tabId);
  let tab = getTab();
  if (!tab) return false;

  const oldPath = tab.path;

  const pendingSavePath = !forceNewPath && tab.path ? tab.path : null;
  let lockedPath: string | null = null;

  if (pendingSavePath && activeSaves.get(pendingSavePath)) {
    return false;
  }

  if (pendingSavePath) {
    activeSaves.set(pendingSavePath, true);
  }

  try {
    // Lazy-loaded session-restored tabs hold an empty placeholder until
    // loadTabContentLazy resolves; writing that placeholder would truncate the
    // file on disk to empty. Wait for the in-flight load (or trigger one) so
    // the content written below is the real file content.
    if (!tab.contentLoaded) {
      const loaded = await waitForTabContentLoad(tabId);
      if (!loaded) {
        if (pendingSavePath) activeSaves.delete(pendingSavePath);
        return false;
      }
      tab = getTab();
      if (!tab) {
        if (pendingSavePath) activeSaves.delete(pendingSavePath);
        return false;
      }
    }

    let savePath: string | null = null;

    if (!forceNewPath && tab.path) {
      savePath = tab.path;
    } else {
      const preferredExt = tab.preferredExtension || 'md';
      const filters =
        preferredExt === 'txt'
          ? [
              { name: translate('fileOps.textShortFilter'), extensions: ['txt'] },
              { name: translate('fileOps.markdownFilter'), extensions: ['md'] },
              { name: translate('fileOps.allFiles'), extensions: ['*'] },
            ]
          : [
              { name: translate('fileOps.markdownFilter'), extensions: ['md'] },
              { name: translate('fileOps.textShortFilter'), extensions: ['txt'] },
              { name: translate('fileOps.allFiles'), extensions: ['*'] },
            ];

      savePath = await save({ filters });
    }

    if (savePath) {
      const sanitizedPath = sanitizePath(savePath);

      tab = getTab();
      if (!tab) return false;
      if (!tab.content) tab.content = '';

      // Don't silently clobber external edits: if the file changed on disk
      // since the tab's last saved baseline, ask before overwriting. This also
      // catches edits that landed inside a previous save's write-lock window,
      // which the watcher was told to ignore. Save-As targets the user chose
      // explicitly, so only guard writes back to the tab's own path.
      if (!forceNewPath && (await hasFileChanged(tab.id))) {
        const result = await confirmDialog({
          title: translate('fileOps.overwriteChangedTitle'),
          message: translate('fileOps.overwriteChangedMessage', { values: { title: tab.title } }),
          saveLabel: translate('fileOps.overwriteLabel'),
          discardLabel: '',
          cancelLabel: translate('common.cancel'),
        });
        if (result !== 'save') {
          if (pendingSavePath) activeSaves.delete(pendingSavePath);
          return false;
        }
      }

      let contentToSave = tab.content;

      const tabIsMarkdown = tab.preferredExtension ? tab.preferredExtension === 'md' : isMarkdownFile(sanitizedPath);
      const shouldFormat = !skipFormat && appContext.settings.formatOnSave && tabIsMarkdown;

      if (shouldFormat) {
        const formatted = await formatMarkdown(contentToSave);

        tab = getTab();
        if (!tab) return false;
        if (tab && tab.content !== contentToSave) {
          contentToSave = tab.content;
        } else if (formatted && formatted !== contentToSave) {
          contentToSave = formatted;
          updateContentOnly(tabId, contentToSave, true);
          tab = getTab();
          if (!tab) return false;
        }
      }

      const targetLineEnding =
        appContext.settings.lineEndingPreference === 'system'
          ? tab.lineEnding || 'LF'
          : appContext.settings.lineEndingPreference;

      let diskContent = normalizeLineEndings(contentToSave);
      if (targetLineEnding === 'CRLF') {
        diskContent = diskContent.replace(/\n/g, '\r\n');
      } else {
        diskContent = diskContent.replace(/\r\n/g, '\n');
      }

      fileWatcher.setWriteLock(sanitizedPath, true);
      lockedPath = sanitizedPath;

      const writeResult = await writeTextFile(sanitizedPath, diskContent, {
        encoding: tab.encoding,
        hasBom: tab.hasBom,
      });
      if (!writeResult) {
        fileWatcher.setWriteLock(sanitizedPath, false);
        if (pendingSavePath) activeSaves.delete(pendingSavePath);
        AppError.handle('File:Write', new Error(translate('fileOps.failedSave')), { showToast: true });
        return false;
      }

      if (oldPath && oldPath !== sanitizedPath) {
        fileWatcher.unwatch(oldPath);
      }
      if (oldPath !== sanitizedPath) {
        await fileWatcher.watch(sanitizedPath);
      }
      // atomic_write replaced the inode at the target, which kills the notify
      // file watch (inotify DELETE_SELF / kqueue NOTE_DELETE). Re-arm in all
      // cases: a same-path save kills this tab's watch, and a save-as onto an
      // already-open path kills that tab's watch too.
      await fileWatcher.renew(sanitizedPath);

      const fileName = getFilename(sanitizedPath) || translate('fileOps.untitled');
      let finalTitle = fileName;

      if (appContext.settings.tabNameFromContent) {
        const smartTitle = extractSmartTitle(contentToSave);
        if (smartTitle) finalTitle = smartTitle;
      }

      saveTabComplete(
        tabId,
        sanitizedPath,
        finalTitle,
        targetLineEnding,
        writeResult.encoding.toUpperCase(),
        writeResult.has_bom,
        writeResult.bytes_written,
      );
      markAsSaved(tabId);
      invalidateMetadataCache(sanitizedPath);
      await refreshMetadata(tabId, sanitizedPath);

      addToFileHistory(sanitizedPath);
      notifyFileSaved(sanitizedPath);

      fileWatcher.setWriteLock(sanitizedPath, false);

      logger.file.info('FileSaved', {
        duration: formatDuration(start),
        path: sanitizedPath,
        size: byteLength(diskContent),
        saveAs: forceNewPath,
      });

      if (pendingSavePath) activeSaves.delete(pendingSavePath);
      return true;
    }
    if (pendingSavePath) activeSaves.delete(pendingSavePath);
    return false;
  } catch (_e) {
    if (pendingSavePath) activeSaves.delete(pendingSavePath);
    if (lockedPath) fileWatcher.setWriteLock(lockedPath, false);
    AppError.handle('File:Write', _e, {
      showToast: true,
      additionalInfo: { path: tab?.path },
    });
    return false;
  }
}
