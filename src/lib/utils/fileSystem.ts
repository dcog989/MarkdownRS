import { appState } from '$lib/stores/appState.svelte.ts';
import { dialogStore } from '$lib/stores/dialogStore.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { toastStore } from '$lib/stores/toastStore.svelte.ts';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { callBackend } from './backend';
import { isTextFile } from './fileValidation';
import { formatMarkdown } from './formatterRust';
import { debounce } from './timing';

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
        const meta = await callBackend<FileMetadata>('get_file_metadata', { path }, 'File:Metadata');
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        // Logging handled by bridge
    }
}

function sanitizePath(path: string): string {
    return path.replace(/\0/g, '').replace(/\\/g, '/');
}

function handleFileSystemError(err: unknown, path?: string) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fileName = path ? path.split(/[\\/]/).pop() || path : 'file';

    if (errorMsg.includes('No such file') || errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
        toastStore.error(`File not found: ${fileName}`, 4000);
    } else if (errorMsg.includes('Permission denied') || errorMsg.includes('Access denied')) {
        toastStore.error(`Cannot access file: ${fileName}`, 4000);
    } else {
        toastStore.error(`Failed operation on: ${fileName}`, 4000);
    }
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
                    listIndent: appState.formatterListIndent,
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
        await callBackend('add_to_dictionary', { word }, 'Dictionary:Add');
        return true;
    } catch (err) {
        return false;
    }
}

async function processSaveQueue() {
    while (saveQueue.length > 0) {
        const saveTask = saveQueue.shift();
        if (saveTask) {
            try { await saveTask(); } catch (err) { }
        }
    }
    isSaving = false;
}

export async function persistSession(): Promise<void> {
    if (!editorStore.sessionDirty || isSaving) return;

    const saveTask = async () => {
        try {
            const mruPositionMap = new Map<string, number>();
            editorStore.mruStack.forEach((tabId, index) => mruPositionMap.set(tabId, index));

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

            editorStore.sessionDirty = false;
            await callBackend('save_session', { tabs: plainTabs }, 'Session:Save');
        } catch (err) {
            editorStore.sessionDirty = true;
            throw err;
        }
    };

    isSaving = true;
    try {
        await saveTask();
        await processSaveQueue();
    } catch (err) {
        isSaving = false;
    }
}

export async function loadSession(): Promise<void> {
    try {
        const rustTabs = await callBackend<RustTabState[]>('restore_session', {}, 'Session:Load');
        if (rustTabs && rustTabs.length > 0) {
            const convertedTabs: EditorTab[] = rustTabs.map(t => {
                const content = normalizeLineEndings(t.content);
                return {
                    id: t.id,
                    title: t.title,
                    originalTitle: t.title,
                    content,
                    lastSavedContent: content,
                    isDirty: t.is_dirty,
                    path: t.path,
                    scrollPercentage: t.scroll_percentage,
                    sizeBytes: new TextEncoder().encode(content).length,
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

            const sortedMru = rustTabs
                .filter(t => t.mru_position !== null && t.mru_position !== undefined)
                .sort((a, b) => (a.mru_position || 0) - (b.mru_position || 0))
                .map(t => t.id);

            editorStore.mruStack = sortedMru.length > 0 ? sortedMru : convertedTabs.map(t => t.id);

            switch (appState.startupBehavior) {
                case 'first': appState.activeTabId = convertedTabs[0].id; break;
                case 'last-focused': appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id; break;
                case 'new': appState.activeTabId = editorStore.addTab(); break;
                default: appState.activeTabId = convertedTabs[0].id;
            }

            await Promise.all(convertedTabs.filter(t => t.path).map(async (tab) => {
                if (tab.isDirty) {
                    try {
                        const res = await callBackend<FileContent>('read_text_file', { path: tab.path! }, 'File:Read');
                        const storeTab = editorStore.tabs.find(x => x.id === tab.id);
                        if (storeTab) {
                            storeTab.lastSavedContent = normalizeLineEndings(res.content);
                            storeTab.isDirty = storeTab.content !== storeTab.lastSavedContent;
                        }
                    } catch (e) { }
                }
                await refreshMetadata(tab.id, tab.path!);
                await checkFileExists(tab.id);
            }));
        } else {
            appState.activeTabId = editorStore.addTab();
        }
    } catch (err) {
        appState.activeTabId = editorStore.addTab();
    }
}

export async function checkFileExists(tabId: string): Promise<void> {
    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab || !tab.path) return;

    tab.fileCheckPerformed = true;
    try {
        await callBackend('get_file_metadata', { path: tab.path }, 'File:Metadata');
        tab.fileCheckFailed = false;
    } catch (err) {
        tab.fileCheckFailed = true;
    }
    editorStore.sessionDirty = true;
}

export const persistSessionDebounced = debounce(persistSession, 500);
