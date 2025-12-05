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
    // Remove any null bytes and normalize path separators
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
            const content = await invoke<string>('read_text_file', { path: sanitizedPath });
            const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

            // Detect Line Ending
            const hasCRLF = content.includes('\r\n');

            const id = editorStore.addTab(fileName, content);
            const tab = editorStore.tabs.find(t => t.id === id);
            if (tab) {
                tab.path = sanitizedPath;
                tab.isDirty = false;
                tab.lineEnding = hasCRLF ? 'CRLF' : 'LF';
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
                contentToSave = contentToSave.replace(/\n/g, '\r\n');
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

    // Don't close pinned tabs unless forced
    if (tab.isPinned && !force) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const result = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
        });

        if (result === 'cancel') {
            return; // Abort closing
        }

        if (result === 'save') {
            const prevActive = appState.activeTabId;
            appState.activeTabId = id;
            const saved = await saveCurrentFile();
            if (!saved) {
                appState.activeTabId = prevActive;
                return; // Abort if save failed/cancelled
            }
        }
        // If result === 'discard', we just proceed
    }

    editorStore.closeTab(id);

    // If we closed the active tab, find new active
    if (appState.activeTabId === id) {
        // Fallback to MRU top
        let nextId = editorStore.mruStack[0];
        appState.activeTabId = nextId || null;
    }

    // Always create a new blank tab if we closed the last one
    if (editorStore.tabs.length === 0) {
        const newId = editorStore.addTab();
        appState.activeTabId = newId;
    }
}

export async function persistSession() {
    if (!editorStore.sessionDirty) return;

    // If already saving, mark that another save is pending
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

        // If another save was requested while we were saving, do it now
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
                lineEnding: t.content.includes('\r\n') ? 'CRLF' : 'LF',
                encoding: 'UTF-8'
            }));

            editorStore.tabs = convertedTabs;
            appState.activeTabId = convertedTabs[0].id;
            editorStore.mruStack = convertedTabs.map(t => t.id);

            // Refresh metadata for all tabs with paths
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
