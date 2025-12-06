import { appState } from '$lib/stores/appState.svelte.ts';
import { dialogStore } from '$lib/stores/dialogStore.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

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
let pendingSave = false;

async function refreshMetadata(tabId: string, path: string) {
    try {
        const meta = await invoke<FileMetadata>('get_file_metadata', { path });
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        console.error("Failed to fetch metadata", e);
    }
}

function sanitizePath(path: string): string {
    return path.replace(/\0/g, '').replace(/\\/g, '/');
}

export async function openFile() {
    try {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Markdown',
                extensions: ['md', 'markdown', 'txt', 'rs', 'js', 'ts', 'svelte', 'json']
            }]
        });

        if (selected && typeof selected === 'string') {
            const sanitizedPath = sanitizePath(selected);
            const result = await invoke<FileContent>('read_text_file', { path: sanitizedPath });
            const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

            // Detect Line Ending based on raw content existence
            // CRITICAL: Must check BEFORE any normalization happens
            // Check for CRLF first, then fall back to LF
            const hasCRLF = result.content.includes('\r\n');
            const hasLF = result.content.includes('\n');
            
            // Determine line ending: if has CRLF anywhere, it's CRLF; otherwise check for LF
            let detectedLineEnding: 'LF' | 'CRLF' = 'LF';
            if (hasCRLF) {
                detectedLineEnding = 'CRLF';
            } else if (hasLF) {
                detectedLineEnding = 'LF';
            }

            const id = editorStore.addTab(fileName, result.content);
            const tab = editorStore.tabs.find(t => t.id === id);
            if (tab) {
                tab.path = sanitizedPath;
                tab.isDirty = false;
                tab.lineEnding = detectedLineEnding;
                tab.encoding = result.encoding.toUpperCase();
                await refreshMetadata(id, sanitizedPath);
            }
            appState.activeTabId = id;
            editorStore.pushToMru(id);
        }
    } catch (err) {
        console.error('Failed to open file:', err);
    }
}

export async function saveCurrentFile() {
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

            // Handle Line Endings
            let contentToSave = tab.content;
            if (tab.lineEnding === 'CRLF') {
                // Ensure LF -> CRLF (CodeMirror normalizes to LF internally)
                contentToSave = contentToSave.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
            } else {
                // Ensure LF
                contentToSave = contentToSave.replace(/\r\n/g, '\n');
            }

            await invoke('write_text_file', { path: sanitizedPath, content: contentToSave });
            tab.path = sanitizedPath;
            tab.title = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';
            tab.isDirty = false;
            await refreshMetadata(tabId, sanitizedPath);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to save file:', err);
        return false;
    }
}

export async function requestCloseTab(id: string, force = false) {
    const tab = editorStore.tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isPinned && !force) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === 'cancel') {
            return;
        }

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
        let nextId = editorStore.mruStack[0];
        appState.activeTabId = nextId || null;
    }

    if (editorStore.tabs.length === 0) {
        const newId = editorStore.addTab();
        appState.activeTabId = newId;
    }
}

export async function addToDictionary(word: string) {
    try {
        await invoke('add_to_dictionary', { word });
        return true;
    } catch (err) {
        console.error("Failed to add to dictionary:", err);
        return false;
    }
}

export async function persistSession() {
    if (!editorStore.sessionDirty) return;

    if (isSaving) {
        pendingSave = true;
        return;
    }

    isSaving = true;

    try {
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
            custom_title: t.customTitle || null
        }));

        await invoke('save_session', { tabs: plainTabs });
        editorStore.sessionDirty = false;

        if (pendingSave) {
            pendingSave = false;
            isSaving = false;
            await persistSession();
        }
    } catch (err) {
        console.error('Failed to save session:', err);
    } finally {
        isSaving = false;
    }
}

export async function loadSession() {
    try {
        const rustTabs = await invoke<RustTabState[]>('restore_session');
        if (rustTabs && rustTabs.length > 0) {
            const convertedTabs: EditorTab[] = rustTabs.map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                isDirty: t.is_dirty,
                path: t.path,
                scrollPercentage: t.scroll_percentage,
                created: t.created || undefined,
                modified: t.modified || undefined,
                isPinned: t.is_pinned,
                customTitle: t.custom_title || undefined,
                lineEnding: t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
                encoding: 'UTF-8' // Default from DB until we persist it
            }));

            editorStore.tabs = convertedTabs;
            appState.activeTabId = convertedTabs[0].id;
            editorStore.mruStack = convertedTabs.map(t => t.id);

            const metadataPromises = convertedTabs
                .filter(t => t.path)
                .map(t => refreshMetadata(t.id, t.path!));

            Promise.all(metadataPromises).catch(err =>
                console.error('Failed to refresh metadata for some tabs:', err)
            );
        } else {
            const id = editorStore.addTab('Untitled-1', '# Welcome to MarkdownRS\n');
            appState.activeTabId = id;
        }
    } catch (err) {
        console.error('Failed to restore session:', err);
        const id = editorStore.addTab('Untitled-1', '# Welcome to MarkdownRS\n');
        appState.activeTabId = id;
    }
}
