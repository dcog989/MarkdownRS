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
};

type FileMetadata = {
    created?: string;
    modified?: string;
};

async function refreshMetadata(tabId: string, path: string) {
    try {
        const meta = await invoke<FileMetadata>('get_file_metadata', { path });
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        console.error("Failed to fetch metadata", e);
    }
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
            const content = await invoke<string>('read_text_file', { path: selected });
            const fileName = selected.split(/[\\/]/).pop() || 'Untitled';

            const id = editorStore.addTab(fileName, content);
            const tab = editorStore.tabs.find(t => t.id === id);
            if (tab) {
                tab.path = selected;
                tab.isDirty = false;
                await refreshMetadata(id, selected);
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
            await invoke('write_text_file', { path: savePath, content: tab.content });
            tab.path = savePath;
            tab.title = savePath.split(/[\\/]/).pop() || 'Untitled';
            tab.isDirty = false;
            await refreshMetadata(tabId, savePath);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to save file:', err);
        return false;
    }
}

export async function requestCloseTab(id: string) {
    const tab = editorStore.tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDirty && tab.content.trim().length > 0) {
        const confirmed = await dialogStore.confirm({
            title: 'Unsaved Changes',
            message: `Do you want to save changes to ${tab.title}?`,
            okLabel: 'Save',
            cancelLabel: "Don't Save"
        });

        if (confirmed) {
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

export async function persistSession() {
    if (!editorStore.sessionDirty) return;

    try {
        const plainTabs: RustTabState[] = editorStore.tabs.map(t => ({
            id: t.id,
            path: t.path,
            title: t.title,
            content: t.content,
            is_dirty: t.isDirty,
            scroll_percentage: t.scrollPercentage,
            created: t.created || null,
            modified: t.modified || null
        }));

        await invoke('save_session', { tabs: plainTabs });
        editorStore.sessionDirty = false;
    } catch (err) {
        console.error('Failed to save session:', err);
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
                modified: t.modified || undefined
            }));

            editorStore.tabs = convertedTabs;
            appState.activeTabId = convertedTabs[0].id;
            editorStore.mruStack = convertedTabs.map(t => t.id);

            convertedTabs.forEach(t => {
                if (t.path) refreshMetadata(t.id, t.path);
            });
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
