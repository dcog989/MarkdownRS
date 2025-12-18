import { appState } from '$lib/stores/appState.svelte.ts';
import { dialogStore } from '$lib/stores/dialogStore.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { AppError } from './errorHandling';
import { isTextFile } from './fileValidation';
import { formatMarkdown } from './formatter';

type RustTabState = {
    id: string;
    title: string;
    content: string;
    is_dirty: boolean;
    path: string | null;
    scroll_percentage: number;
    created: string | null;
    modified: string | null;
    is_pinned: boolean;
    custom_title: string | null;
    file_check_failed?: boolean;
    file_check_performed?: boolean;
    mru_position?: number | null;
};

type FileMetadata = {
    created?: string;
    modified?: string;
};

type FileContent = {
    content: string;
    encoding: string;
};

let isSaving = false;
let saveQueue: (() => Promise<void>)[] = [];

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

async function refreshMetadata(tabId: string, path: string) {
    try {
        const meta = await invoke<FileMetadata>('get_file_metadata', { path });
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        AppError.log('File:Metadata', e, { tabId, path });
    }
}

function sanitizePath(path: string): string {
    // Remove null bytes but preserve colons for Windows drive letters
    return path.replace(/\0/g, '').replace(/\\/g, '/');
}

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

        const result = await invoke<FileContent>('read_text_file', { path: sanitizedPath });
        const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

        const crlfCount = (result.content.match(/\r\n/g) || []).length;
        const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
        const detectedLineEnding: 'LF' | 'CRLF' =
            crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';

        const id = editorStore.addTab(fileName, result.content);
        const tab = editorStore.tabs.find(t => t.id === id);
        if (tab) {
            tab.path = sanitizedPath;
            tab.isDirty = false;
            tab.lineEnding = detectedLineEnding;
            tab.encoding = result.encoding.toUpperCase();
            tab.fileCheckPerformed = false;
            await refreshMetadata(id, sanitizedPath);
            await checkFileExists(id);
        }
        appState.activeTabId = id;
        editorStore.pushToMru(id);
    } catch (err) {
        AppError.log('File:Read', err);
    }
}

export async function navigateToPath(clickedPath: string) {
    const activeTab = editorStore.tabs.find(t => t.id === appState.activeTabId);

    try {
        const resolvedPath = await invoke<string>('resolve_path_relative', {
            basePath: activeTab?.path,
            clickPath: clickedPath.replace(/\\/g, '/')
        });

        if (isTextFile(resolvedPath)) {
            await openFile(resolvedPath);
        } else {
            await openPath(resolvedPath);
        }
    } catch (err) {
        console.warn('Navigation failed:', err);
    }
}

export async function saveCurrentFile(): Promise<boolean> {
    const tabId = appState.activeTabId;
    if (!tabId) return false;

    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab) return false;

    try {
        let savePath = tab.path;

        if (!savePath) {
            savePath = await save({
                filters: [{ name: 'Markdown', extensions: ['md'] }]
            });
        }

        if (savePath) {
            const sanitizedPath = sanitizePath(savePath);

            let contentToSave = tab.content;
            if (appState.formatOnSave && !sanitizedPath.endsWith('.txt')) {
                try {
                    contentToSave = formatMarkdown(contentToSave, {
                        listIndent: appState.formatterListIndent,
                        bulletChar: appState.formatterBulletChar,
                        codeBlockFence: appState.formatterCodeFence,
                        tableAlignment: appState.formatterTableAlignment
                    });
                    tab.content = contentToSave;
                } catch (err) {
                    console.error('Format on save failed:', err);
                }
            }

            let targetLineEnding: 'LF' | 'CRLF';
            if (appState.lineEndingPreference === 'system') {
                targetLineEnding = tab.lineEnding || 'LF';
            } else {
                targetLineEnding = appState.lineEndingPreference;
            }

            if (targetLineEnding === 'CRLF') {
                contentToSave = contentToSave.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
            } else {
                contentToSave = contentToSave.replace(/\r\n/g, '\n');
            }

            tab.lineEnding = targetLineEnding;

            await invoke('write_text_file', { path: sanitizedPath, content: contentToSave });
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
        AppError.log('File:Write', err, { tabId, path: tab?.path });
        return false;
    }
}

export async function requestCloseTab(id: string, force = false): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === id);
    if (!tab) return;
    if (tab.isPinned && !force) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === 'cancel') return;

        if (result === 'save') {
            const prevActive = appState.activeTabId;
            appState.activeTabId = id;
            const saved = await saveCurrentFile();
            if (!saved) {
                appState.activeTabId = prevActive;
                return;
            }
        }
    }

    editorStore.closeTab(id);

    if (appState.activeTabId === id) {
        appState.activeTabId = editorStore.mruStack[0] || null;
    }

    if (editorStore.tabs.length === 0) {
        appState.activeTabId = editorStore.addTab();
    }
}

export async function addToDictionary(word: string): Promise<boolean> {
    try {
        await invoke('add_to_dictionary', { word });
        return true;
    } catch (err) {
        AppError.log('Dictionary:Add', err, { word });
        return false;
    }
}

async function processSaveQueue() {
    while (saveQueue.length > 0) {
        const saveTask = saveQueue.shift();
        if (saveTask) {
            try {
                await saveTask();
            } catch (err) {
                AppError.log('Session:Save', err);
            }
        }
    }
    isSaving = false;
}

export async function persistSession(): Promise<void> {
    if (!editorStore.sessionDirty) return;

    const saveTask = async () => {
        try {
            const mruPositionMap = new Map<string, number>();
            editorStore.mruStack.forEach((tabId, index) => {
                mruPositionMap.set(tabId, index);
            });

            const plainTabs: RustTabState[] = editorStore.tabs.map(t => ({
                id: t.id,
                path: t.path,
                title: t.title,
                content: t.content,
                is_dirty: t.isDirty,
                scroll_percentage: t.scrollPercentage,
                created: t.created || null,
                modified: t.modified || null,
                is_pinned: t.isPinned || false,
                custom_title: t.customTitle || null,
                file_check_failed: t.fileCheckFailed || false,
                file_check_performed: t.fileCheckPerformed || false,
                mru_position: mruPositionMap.get(t.id) ?? null
            }));

            await invoke('save_session', { tabs: plainTabs });
            editorStore.sessionDirty = false;
        } catch (err) {
            AppError.log('Session:Save', err);
            throw err;
        }
    };

    if (isSaving) {
        saveQueue.push(saveTask);
        return;
    }

    isSaving = true;
    try {
        await saveTask();
        await processSaveQueue();
    } catch (err) {
        isSaving = false;
    }
}

export async function checkFileExists(tabId: string): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab || !tab.path) return;

    tab.fileCheckPerformed = true;
    try {
        await invoke('get_file_metadata', { path: tab.path });
        tab.fileCheckFailed = false;
        editorStore.sessionDirty = true;
    } catch (err) {
        tab.fileCheckFailed = true;
        editorStore.sessionDirty = true;
    }
}

export async function loadSession(): Promise<void> {
    try {
        const rustTabs = await invoke<RustTabState[]>('restore_session');
        if (rustTabs && rustTabs.length > 0) {
            const convertedTabs: EditorTab[] = rustTabs.map(t => {
                const normalizedContent = normalizeLineEndings(t.content);
                return {
                    id: t.id,
                    title: t.title,
                    originalTitle: t.title,
                    content: normalizedContent,
                    lastSavedContent: normalizedContent,
                    isDirty: t.is_dirty,
                    path: t.path,
                    scrollPercentage: t.scroll_percentage,
                    created: t.created || undefined,
                    modified: t.modified || undefined,
                    isPinned: t.is_pinned,
                    customTitle: t.custom_title || undefined,
                    lineEnding: t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
                    encoding: 'UTF-8',
                    fileCheckFailed: t.file_check_failed || false,
                    fileCheckPerformed: t.file_check_performed || false
                };
            });

            editorStore.tabs = convertedTabs;

            const tabsWithMruPosition = rustTabs
                .map((t, index) => ({ tab: t, originalIndex: index }))
                .filter(item => item.tab.mru_position !== null && item.tab.mru_position !== undefined)
                .sort((a, b) => (a.tab.mru_position || 0) - (b.tab.mru_position || 0));

            if (tabsWithMruPosition.length > 0) {
                editorStore.mruStack = tabsWithMruPosition.map(item => item.tab.id);
            } else {
                editorStore.mruStack = convertedTabs.map(t => t.id);
            }

            switch (appState.startupBehavior) {
                case 'first':
                    appState.activeTabId = convertedTabs[0].id;
                    break;
                case 'last-focused':
                    appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id;
                    break;
                case 'new':
                    appState.activeTabId = editorStore.addTab();
                    break;
                default:
                    appState.activeTabId = convertedTabs[0].id;
            }

            const dirtyTabsWithPath = convertedTabs.filter(t => t.path && t.isDirty);
            await Promise.all(dirtyTabsWithPath.map(async (tab) => {
                try {
                    const result = await invoke<FileContent>('read_text_file', { path: tab.path! });
                    const storeTab = editorStore.tabs.find(x => x.id === tab.id);
                    if (storeTab) {
                        storeTab.lastSavedContent = normalizeLineEndings(result.content);
                        storeTab.isDirty = storeTab.content !== storeTab.lastSavedContent;
                    }
                } catch (e) {
                    console.warn(`Could not read original content for dirty tab ${tab.id}:`, e);
                }
            }));

            await Promise.all(
                convertedTabs
                    .filter(t => t.path)
                    .map(async (t) => {
                        try {
                            await refreshMetadata(t.id, t.path!);
                            await checkFileExists(t.id);
                        } catch (err) {
                            console.error(`Failed to check tab ${t.id}:`, err);
                        }
                    })
            );
        } else {
            appState.activeTabId = editorStore.addTab();
        }
    } catch (err) {
        AppError.log('Session:Load', err);
        appState.activeTabId = editorStore.addTab();
    }
}
