import { editorStore } from '$lib/stores/editorStore.svelte.ts';
import { AppError } from '$lib/utils/errorHandling';
import { callBackend } from '$lib/utils/backend';

export type FileContent = {
	content: string;
	encoding: string;
};

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

export async function refreshMetadata(tabId: string, path: string): Promise<void> {
	try {
		const meta = await callBackend<FileMetadata>('get_file_metadata', { path }, 'File:Metadata');
		editorStore.updateMetadata(tabId, meta.created, meta.modified);
	} catch (err) {
		// Silently handle - logging already done by callBackend
		// File might not exist or be inaccessible
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
		// Don't show toast - this is a background check
		AppError.handle('File:Metadata', err, {
			showToast: false,
			severity: 'warning',
			additionalInfo: { path: tab.path, tabId }
		});
	}
	editorStore.sessionDirty = true;
}

export async function checkAndReloadIfChanged(tabId: string): Promise<boolean> {
	const tab = editorStore.tabs.find(t => t.id === tabId);
	if (!tab || !tab.path) return false;

	// If the tab has unsaved changes, don't auto-reload to avoid losing user's work
	if (tab.isDirty) return false;

	try {
		const meta = await callBackend<FileMetadata>('get_file_metadata', { path: tab.path }, 'File:Metadata');

		// Check if the file's modification time has changed since we last loaded it
		if (meta.modified && tab.modified && meta.modified !== tab.modified) {
			// File has been modified externally - we need to reload it
			return true;
		}
		return false;
	} catch (err) {
		// File doesn't exist or can't be read
		tab.fileCheckFailed = true;
		editorStore.sessionDirty = true;
		
		AppError.handle('File:Metadata', err, {
			showToast: false,
			severity: 'warning',
			additionalInfo: { path: tab.path, tabId }
		});
		return false;
	}
}

export async function reloadFileContent(tabId: string): Promise<void> {
	const tab = editorStore.tabs.find(t => t.id === tabId);
	if (!tab || !tab.path) return;

	try {
		const sanitizedPath = sanitizePath(tab.path);
		const result = await callBackend<FileContent>('read_text_file', { path: sanitizedPath }, 'File:Read');

		// Detect line endings
		const crlfCount = (result.content.match(/\r\n/g) || []).length;
		const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
		const detectedLineEnding: 'LF' | 'CRLF' = 
			crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';

		// Normalize content to ensure dirty check works correctly with CodeMirror (which uses LF)
		const content = normalizeLineEndings(result.content);

		// Update the tab with new content
		tab.content = content;
		tab.lastSavedContent = content;
		tab.isDirty = false;
		tab.lineEnding = detectedLineEnding;
		tab.encoding = result.encoding.toUpperCase();
		tab.sizeBytes = new TextEncoder().encode(result.content).length;
		tab.fileCheckPerformed = false;

		await refreshMetadata(tabId, sanitizedPath);
		editorStore.sessionDirty = true;
	} catch (err) {
		AppError.handle('File:Read', err, {
			showToast: true,
			userMessage: 'Failed to reload file',
			additionalInfo: { path: tab.path, tabId }
		});
	}
}
