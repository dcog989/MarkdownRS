import { appState } from '$lib/stores/appState.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

type FileMetadata = {
    created?: string;
    modified?: string;
};

// Helper to fetch and update metadata for a tab
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
        }
    } catch (err) {
        console.error('Failed to open file:', err);
    }
}

export async function saveCurrentFile() {
    const tabId = appState.activeTabId;
    if (!tabId) return;

    const tab = editorStore.tabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
        let savePath = tab.path;

        if (!savePath) {
            savePath = await save({
                filters: [{
                    name: 'Markdown',
                    extensions: ['md']
                }]
            });
        }

        if (savePath) {
            await invoke('write_text_file', { path: savePath, content: tab.content });
            tab.path = savePath;
            tab.title = savePath.split(/[\\/]/).pop() || 'Untitled';
            tab.isDirty = false;
            // Refresh modification time after save
            await refreshMetadata(tabId, savePath);
        }
    } catch (err) {
        console.error('Failed to save file:', err);
    }
}

export async function persistSession() {
    try {
        const plainTabs = editorStore.tabs.map(t => ({
            id: t.id,
            path: t.path,
            title: t.title,
            content: t.content,
            is_dirty: t.isDirty,
            scroll_percentage: t.scrollPercentage
        }));

        await invoke('save_session', { tabs: plainTabs });
    } catch (err) {
        console.error('Failed to save session:', err);
    }
}

type RustTabState = {
    id: string;
    title: string;
    content: string;
    is_dirty: boolean;
    path: string | null;
    scroll_percentage: number;
};

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
                scrollPercentage: t.scroll_percentage
            }));

            editorStore.tabs = convertedTabs;
            appState.activeTabId = convertedTabs[0].id;

            // Background refresh metadata for restored tabs that have paths
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
