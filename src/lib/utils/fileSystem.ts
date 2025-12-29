import { addToDictionary } from '$lib/services/dictionaryService';
import { checkAndReloadIfChanged, checkFileExists, refreshMetadata, reloadFileContent, sanitizePath } from '$lib/services/fileMetadata';
import { fileWatcher } from '$lib/services/fileWatcher';
import { loadSession, persistSession, persistSessionDebounced } from '$lib/services/sessionPersistence';
import { appContext } from '$lib/stores/state.svelte.ts';
import { AppError } from '$lib/utils/errorHandling';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { callBackend } from './backend';
import { SUPPORTED_TEXT_EXTENSIONS } from './fileValidation';
import { formatMarkdown } from './formatterRust';

export { addToDictionary, checkAndReloadIfChanged, checkFileExists, loadSession, persistSession, persistSessionDebounced, reloadFileContent };

export async function openFile(path?: string): Promise<void> {
	try {
		let targetPath = path;

		if (!targetPath) {
			const selected = await open({
				multiple: false,
				filters: [
					{ name: 'Text Files', extensions: SUPPORTED_TEXT_EXTENSIONS },
					{ name: 'All Files', extensions: ['*'] }
				]
			});
			if (!selected || typeof selected !== 'string') return;
			targetPath = selected;
		}

		const sanitizedPath = sanitizePath(targetPath);
		const existingTab = appContext.editor.tabs.find(t => t.path === sanitizedPath);

		if (existingTab) {
			appContext.app.activeTabId = existingTab.id;
			appContext.editor.pushToMru(existingTab.id);
			return;
		}

		const result = await callBackend('read_text_file', { path: sanitizedPath }, 'File:Read');
		const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';

		const crlfCount = (result.content.match(/\r\n/g) || []).length;
		const lfOnlyCount = (result.content.match(/(?<!\r)\n/g) || []).length;
		const detectedLineEnding: 'LF' | 'CRLF' = crlfCount > 0 && (crlfCount >= lfOnlyCount || lfOnlyCount === 0) ? 'CRLF' : 'LF';

		const id = appContext.editor.addTab(fileName, result.content);
		appContext.editor.updateTabMetadataAndPath(id, {
			path: sanitizedPath,
			isDirty: false,
			lineEnding: detectedLineEnding,
			encoding: result.encoding.toUpperCase(),
			fileCheckPerformed: false,
			sizeBytes: new TextEncoder().encode(result.content).length
		});
		await refreshMetadata(id, sanitizedPath);
		await checkFileExists(id);
		await fileWatcher.watch(sanitizedPath);
		appContext.app.activeTabId = id;
		appContext.editor.pushToMru(id);
	} catch (err) {
		AppError.handle('File:Read', err, {
			showToast: true,
			additionalInfo: { path }
		});
	}
}

export async function openFileByPath(path: string): Promise<void> {
	await openFile(path);
}

export async function navigateToPath(clickedPath: string): Promise<void> {
	const activeTab = appContext.editor.tabs.find(t => t.id === appContext.app.activeTabId);

	if (!clickedPath || clickedPath.length > 1024 || clickedPath.includes('\n')) {
		return;
	}

	try {
		// Resolve the path relative to the current file (handles ./ ../ etc)
		const resolvedPath = await callBackend('resolve_path_relative', {
			basePath: activeTab?.path || null,
			clickPath: clickedPath.replace(/\\/g, '/')
		}, 'File:Read');

		// Always use the system's associated application for clicked links.
		// This handles directories (Explorer/Finder), Web URLs (Browser),
		// and Files (Associated App) via the OS.
		await openPath(resolvedPath);
	} catch (err) {
		// Silent failure for resolution issues or cancelled actions
	}
}

export async function saveCurrentFile(): Promise<boolean> {
	const tabId = appContext.app.activeTabId;
	if (!tabId) return false;

	const tab = appContext.editor.tabs.find(t => t.id === tabId);
	if (!tab) return false;

	const oldPath = tab.path;

	try {
		let savePath = tab.path;
		if (!savePath) {
			savePath = await save({
				filters: [
					{ name: 'Markdown', extensions: ['md'] },
					{ name: 'All Files', extensions: ['*'] }
				]
			});
		}

		if (savePath) {
			const sanitizedPath = sanitizePath(savePath);
			let contentToSave = tab.content;

			if (appContext.app.formatOnSave && !sanitizedPath.endsWith('.txt')) {
				contentToSave = await formatMarkdown(contentToSave, {
					listIndent: appContext.app.defaultIndent,
					bulletChar: appContext.app.formatterBulletChar,
					codeBlockFence: appContext.app.formatterCodeFence,
					tableAlignment: appContext.app.formatterTableAlignment
				});
				appContext.editor.updateContentOnly(tabId, contentToSave);
			}

			const targetLineEnding = appContext.app.lineEndingPreference === 'system'
				? (tab.lineEnding || 'LF')
				: appContext.app.lineEndingPreference;

			if (targetLineEnding === 'CRLF') {
				contentToSave = contentToSave.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
			} else {
				contentToSave = contentToSave.replace(/\r\n/g, '\n');
			}

			await callBackend('write_text_file', { path: sanitizedPath, content: contentToSave }, 'File:Write');

			if (oldPath && oldPath !== sanitizedPath) {
				fileWatcher.unwatch(oldPath);
			}
			if (oldPath !== sanitizedPath) {
				await fileWatcher.watch(sanitizedPath);
			}

			const fileName = sanitizedPath.split(/[\\/]/).pop() || 'Untitled';
			appContext.editor.saveTabComplete(tabId, sanitizedPath, fileName, targetLineEnding);
			appContext.editor.markAsSaved(tabId);
			await refreshMetadata(tabId, sanitizedPath);
			return true;
		}
		return false;
	} catch (err) {
		AppError.handle('File:Write', err, {
			showToast: true,
			additionalInfo: { path: tab.path || 'new file' }
		});
		return false;
	}
}

export async function requestCloseTab(id: string, force = false): Promise<void> {
	const tab = appContext.editor.tabs.find(t => t.id === id);
	if (!tab || (tab.isPinned && !force)) return;

	if (tab.isDirty && tab.content.trim().length > 0) {
		const result = await appContext.ui.dialog.confirm({
			title: 'Unsaved Changes',
			message: `Do you want to save changes to ${tab.title}?`,
		});

		if (result === 'cancel') return;
		if (result === 'save') {
			const prev = appContext.app.activeTabId;
			appContext.app.activeTabId = id;
			if (!(await saveCurrentFile())) {
				appContext.app.activeTabId = prev;
				return;
			}
		}
	}

	if (tab.path) {
		fileWatcher.unwatch(tab.path);
	}

	appContext.editor.closeTab(id);
	if (appContext.app.activeTabId === id) {
		appContext.app.activeTabId = appContext.editor.mruStack[0] || null;
	}
	if (appContext.editor.tabs.length === 0) {
		appContext.app.activeTabId = appContext.editor.addTab();
	}
}
