import { editorStore } from '$lib/stores/editorStore.svelte.ts';
import { callBackend } from '$lib/utils/backend';

type FileMetadata = {
    created?: string;
    modified?: string;
};

export function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
}

export function sanitizePath(path: string): string {
    return path.replace(/\0/g, '').replace(/\\/g, '/');
}

export async function refreshMetadata(tabId: string, path: string) {
    try {
        const meta = await callBackend<FileMetadata>('get_file_metadata', { path }, 'File:Metadata');
        editorStore.updateMetadata(tabId, meta.created, meta.modified);
    } catch (e) {
        // Logging handled by bridge
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
