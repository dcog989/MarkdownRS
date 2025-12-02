import { appState } from '$lib/stores/appState.svelte.ts';
import { editorStore } from '$lib/stores/editorStore.svelte.ts';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export async function openFile() {
    try {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Markdown',
                extensions: ['md', 'markdown', 'txt']
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
        }
    } catch (err) {
        console.error('Failed to save file:', err);
    }
}

// Auto-save session logic
export async function persistSession() {
    try {
        // Convert proxy objects to plain objects for serialization
        // Ensure field names match Rust 'TabState' struct (snake_case)
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

export async function loadSession() {
    try {
        const tabs = await invoke<any[]>('restore_session');
        if (tabs && tabs.length > 0) {
            editorStore.tabs = tabs;
            appState.activeTabId = tabs[0].id;
        } else {
            // Default start state
            const id = editorStore.addTab('Untitled-1', '# Welcome to MarkdownRS\n');
            appState.activeTabId = id;
        }
    } catch (err) {
        console.error('Failed to restore session:', err);
    }
}
