import { reloadTabContent, setFileCheckStatus, updateMetadata } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from '$lib/utils/backend';
import { AppError } from '$lib/utils/errorHandling';

export type FileContent = {
	content: string;
	encoding: string;
};

type FileMetadata = {
	created?: string;
	modified?: string;
};

const metadataCache = new Map<string, { expires: number; promise: Promise<FileMetadata> }>();
const CACHE_TTL_MS = 500;

async function getCachedFileMetadata(path: string): Promise<FileMetadata> {
	const now = Date.now();
	const cached = metadataCache.get(path);

	if (cached && now < cached.expires) {
		return cached.promise;
	}

	const promise = callBackend('get_file_metadata', { path }, 'File:Metadata').then(result => {
		if (!result) {
			throw new Error('Failed to get file metadata: null result');
		}
		return result;
	});
	metadataCache.set(path, { expires: now + CACHE_TTL_MS, promise });

	return promise;
}

export function invalidateMetadataCache(path: string) {
	metadataCache.delete(path);
}

export function normalizeLineEndings(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

export function sanitizePath(path: string): string {
	return path.replace(/\0/g, '').replace(/\\/g, '/');
}

export async function refreshMetadata(tabId: string, path: string): Promise<void> {
	try {
		const meta = await getCachedFileMetadata(path);
		updateMetadata(tabId, meta.created, meta.modified);
	} catch (err) {
		// Silently handle
	}
}

export async function checkFileExists(tabId: string): Promise<void> {
	const tab = appContext.editor.tabs.find(t => t.id === tabId);
	if (!tab || !tab.path) return;

	try {
		await getCachedFileMetadata(tab.path);
		setFileCheckStatus(tabId, true, false);
	} catch (err) {
		setFileCheckStatus(tabId, true, true);
		AppError.handle('File:Metadata', err, {
			showToast: false,
			severity: 'warning',
			additionalInfo: { path: tab.path, tabId }
		});
	}
}

export async function checkAndReloadIfChanged(tabId: string): Promise<boolean> {
	const tab = appContext.editor.tabs.find(t => t.id === tabId);
	if (!tab || !tab.path) return false;

	if (tab.isDirty) return false;

	try {
		const meta = await getCachedFileMetadata(tab.path);

		if (meta.modified && tab.modified && meta.modified !== tab.modified) {
			return true;
		}
		return false;
	} catch (err) {
		setFileCheckStatus(tabId, true, true);

		AppError.handle('File:Metadata', err, {
			showToast: false,
			severity: 'warning',
			additionalInfo: { path: tab.path, tabId }
		});
		return false;
	}
}

export async function reloadFileContent(tabId: string): Promise<void> {
	const tab = appContext.editor.tabs.find(t => t.id === tabId);
	if (!tab || !tab.path) return;

	try {
		const sanitizedPath = sanitizePath(tab.path);
		const result = await callBackend('read_text_file', { path: sanitizedPath }, 'File:Read');

		if (!result) {
			throw new Error('Failed to read file: null result');
		}

		const crlfCount = (result.content.match(/\r\n/g) || []).length;
		const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
		const detectedLineEnding: 'LF' | 'CRLF' =
			crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';

		const content = normalizeLineEndings(result.content);
		const sizeBytes = new TextEncoder().encode(result.content).length;

		reloadTabContent(
			tabId,
			content,
			detectedLineEnding,
			result.encoding.toUpperCase(),
			sizeBytes
		);

		await refreshMetadata(tabId, sanitizedPath);
	} catch (err) {
		AppError.handle('File:Read', err, {
			showToast: true,
			userMessage: 'Failed to reload file',
			additionalInfo: { path: tab.path, tabId }
		});
	}
}
