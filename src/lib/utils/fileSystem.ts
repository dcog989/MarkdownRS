import { addToDictionary } from '$lib/services/dictionaryService';
import { checkAndReloadIfChanged, checkFileExists, refreshMetadata, reloadFileContent, sanitizePath, type FileContent } from '$lib/services/fileMetadata';
import { fileWatcher } from '$lib/services/fileWatcher';
import { loadSession, persistSession, persistSessionDebounced } from '$lib/services/sessionPersistence';
import { appState } from '$lib/stores/appState.svelte.ts';
import { dialogStore } from '$lib/stores/dialogStore.svelte.ts';
import { editorStore } from '$lib/stores/editorStore.svelte.ts';
import { toastStore } from '$lib/stores/toastStore.svelte.ts';
import { handleFileSystemError } from '$lib/utils/errorHandling';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { callBackend } from './backend';
import { isTextFile } from './fileValidation';
import { formatMarkdown } from './formatterRust';

// Re-export service functions for backward compatibility with existing imports
export { addToDictionary, checkAndReloadIfChanged, checkFileExists, loadSession, persistSession, persistSessionDebounced, reloadFileContent };

export async function openFile(path?: string): Promise<void> {
    try {
        let targetPath = path;

        if (!targetPath) {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Markdown',
                    extensions: ['md', 'markdown', 'txt', 'rs', 'js', 'ts', 'svelte', 'json']
                }]
            });
            if (!selected || typeof selected !== 'string') return;
            targetPath = selected;
        }

        const sanitizedPath = sanitizePath(targetPath);
        const existingTab = editorStore.tabs.find(t => t.path === sanitizedPath);

        if (existingTab) {
            appState.activeTabId = existingTab.id;
            editorStore.pushToMru(existingTab.id);
            return;
        }

        const result = await callBackend<FileContent>('read_text_file', { path: sanitizedPath }, 'File:Read');
        const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

        const crlfCount = (result.content.match(/\r\n/g) || []).length;
        const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
        const detectedLineEnding: 'LF' | 'CRLF' = crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';

        const id = editorStore.addTab(fileName, result.content);
        const tab = editorStore.tabs.find(t => t.id === id);
        if (tab) {
            tab.path = sanitizedPath;
            tab.isDirty = false;
            tab.lineEnding = detectedLineEnding;
            tab.encoding = result.encoding.toUpperCase();
            tab.fileCheckPerformed = false;
            tab.sizeBytes = new TextEncoder().encode(result.content).length;
            await refreshMetadata(id, sanitizedPath);
            await checkFileExists(id);
            await fileWatcher.watch(sanitizedPath);
        }
        appState.activeTabId = id;
        editorStore.pushToMru(id);

        if (path) toastStore.success(`Opened: ${fileName}`, 2000);
    } catch (err) {
        handleFileSystemError(err, path);
    }
}

export async function openFileByPath(path: string): Promise<void> {
    await openFile(path);
}

export async function navigateToPath(clickedPath: string) {
    const activeTab = editorStore.tabs.find(t => t.id === appState.activeTabId);
    try {
        const resolvedPath = await callBackend<string>('resolve_path_relative', {
            basePath: activeTab?.path,
            clickPath: clickedPath.replace(/\\/g, '/')
        }, 'File:Read');

        if (isTextFile(resolvedPath)) {
            await openFile(resolvedPath);
        } else {
            await openPath(resolvedPath);
        }
    } catch (err) {
        handleFileSystemError(err, clickedPath);
    }
}

export async function saveCurrentFile(): Promise<boolean> {
    const tabId = appState.activeTabId;
    if (!tabId) return false;

    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab) return false;

    const oldPath = tab.path;

    try {
        let savePath = tab.path;
        if (!savePath) {
            savePath = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
        }

        if (savePath) {
            const sanitizedPath = sanitizePath(savePath);
            let contentToSave = tab.content;

            if (appState.formatOnSave && !sanitizedPath.endsWith('.txt')) {
                contentToSave = await formatMarkdown(contentToSave, {
                    listIndent: appState.defaultIndent,
                    bulletChar: appState.formatterBulletChar,
                    codeBlockFence: appState.formatterCodeFence,
                    tableAlignment: appState.formatterTableAlignment
                });
                tab.content = contentToSave;
            }

            const targetLineEnding = appState.lineEndingPreference === 'system'
                ? (tab.lineEnding || 'LF')
                : appState.lineEndingPreference;

            if (targetLineEnding === 'CRLF') {
                contentToSave = contentToSave.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
            } else {
                contentToSave = contentToSave.replace(/\r\n/g, '\n');
            }

            tab.lineEnding = targetLineEnding;
            await callBackend('write_text_file', { path: sanitizedPath, content: contentToSave }, 'File:Write');

            if (oldPath && oldPath !== sanitizedPath) {
                fileWatcher.unwatch(oldPath);
            }
            if (oldPath !== sanitizedPath) {
                await fileWatcher.watch(sanitizedPath);
            }

            tab.path = sanitizedPath;
            tab.title = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';
            editorStore.markAsSaved(tabId);
            tab.fileCheckPerformed = false;
            tab.fileCheckFailed = false;
            await refreshMetadata(tabId, sanitizedPath);
            return true;
        }
        return false;
    } catch (err) {
        handleFileSystemError(err, tab.path || 'document');
        return false;
    }
}

export async function requestCloseTab(id: string, force = false): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === id);
    if (!tab || (tab.isPinned && !force)) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === 'cancel') return;
        if (result === 'save') {
            const prev = appState.activeTabId;
            appState.activeTabId = id;
            if (!(await saveCurrentFile())) {
                appState.activeTabId = prev;
                return;
            }
        }
    }

    if (tab.path) {
        fileWatcher.unwatch(tab.path);
    }

    editorStore.closeTab(id);
    if (appState.activeTabId === id) {
        appState.activeTabId = editorStore.mruStack[0] || null;
    }
    if (editorStore.tabs.length === 0) {
        appState.activeTabId = editorStore.addTab();
    }
}
