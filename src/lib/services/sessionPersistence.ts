import { addTab } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { formatTimestampForDisplay } from '$lib/utils/date';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';
import { checkAndReloadIfChanged, checkFileExists, normalizeLineEndings, refreshMetadata, reloadFileContent } from './fileMetadata';
import { fileWatcher } from './fileWatcher';

// Local types for backend communication
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
	sort_index?: number;
};

// Only import types if needed
import type { EditorTab } from '$lib/stores/editorStore.svelte';

class SessionPersistenceManager {
	private isSaving = false;
	private pendingSaveRequested = false;

	async requestSave(): Promise<void> {
		if (!appContext.editor.sessionDirty) return;

		if (this.isSaving) {
			this.pendingSaveRequested = true;
			return;
		}

		this.isSaving = true;

		try {
			await this.executeSave();
			while (this.pendingSaveRequested) {
				this.pendingSaveRequested = false;
				if (appContext.editor.sessionDirty) {
					await this.executeSave();
				}
			}
		} finally {
			this.isSaving = false;
		}
	}

	private async executeSave(): Promise<void> {
		try {
			const mruPositionMap = new Map<string, number>();
			appContext.editor.mruStack.forEach((tabId, index) => mruPositionMap.set(tabId, index));

			const plainTabs: RustTabState[] = appContext.editor.tabs.map((t, index) => ({
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
				mru_position: mruPositionMap.get(t.id) ?? null,
				sort_index: index
			}));

			appContext.editor.sessionDirty = false;
			await callBackend('save_session', { tabs: plainTabs }, 'Session:Save');
		} catch (err) {
			appContext.editor.sessionDirty = true;
			AppError.handle('Session:Save', err, {
				showToast: false,
				severity: 'warning'
			});
		}
	}
}

const persistenceManager = new SessionPersistenceManager();

export async function initializeTabFileState(tab: EditorTab): Promise<void> {
	if (!tab.path) return;

	if (!tab.isDirty) {
		const hasChanged = await checkAndReloadIfChanged(tab.id);
		if (hasChanged) {
			await reloadFileContent(tab.id);
		}
	}

	if (tab.isDirty) {
		try {
			const res = await callBackend(
				'read_text_file',
				{ path: tab.path },
				'File:Read'
			);
			const storeTab = appContext.editor.tabs.find(x => x.id === tab.id);
			if (storeTab) {
				storeTab.lastSavedContent = normalizeLineEndings(res.content);
				storeTab.isDirty = storeTab.content !== storeTab.lastSavedContent;
			}
		} catch (err) {
			AppError.handle('File:Read', err, {
				showToast: false,
				severity: 'warning',
				additionalInfo: { path: tab.path }
			});
		}
	}

	await refreshMetadata(tab.id, tab.path);
	await checkFileExists(tab.id);

	try {
		await fileWatcher.watch(tab.path);
	} catch (err) {
		AppError.handle('FileWatcher:Watch', err, {
			showToast: false,
			severity: 'warning',
			additionalInfo: { path: tab.path }
		});
	}
}

export async function persistSession(): Promise<void> {
	await persistenceManager.requestSave();
}

export async function loadSession(): Promise<void> {
	try {
		const rustTabs = await callBackend('restore_session', {}, 'Session:Load');
		if (rustTabs && rustTabs.length > 0) {
			// Sort tabs by sort_index if available, otherwise by DB order (implied creation or legacy)
			rustTabs.sort((a: RustTabState, b: RustTabState) => {
				const idxA = a.sort_index ?? 0;
				const idxB = b.sort_index ?? 0;
				return idxA - idxB;
			});

			const convertedTabs: EditorTab[] = rustTabs.map((t: RustTabState) => {
				const content = normalizeLineEndings(t.content);
				const timestamp = t.modified || t.created || "";
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
					cursor: { anchor: 0, head: 0 }, // Reset cursor on load
					created: t.created || undefined,
					modified: t.modified || undefined,
					formattedTimestamp: formatTimestampForDisplay(timestamp),
					isPinned: t.is_pinned,
					customTitle: t.custom_title || undefined,
					lineEnding: t.content.indexOf('\r\n') !== -1 ? 'CRLF' : 'LF',
					encoding: 'UTF-8',
					fileCheckFailed: t.file_check_failed || false,
					fileCheckPerformed: t.file_check_performed || false
				};
			});

			appContext.editor.tabs = convertedTabs;

			const sortedMru = rustTabs
				.filter((t: RustTabState) => t.mru_position !== null && t.mru_position !== undefined)
				.sort((a: RustTabState, b: RustTabState) => (a.mru_position || 0) - (b.mru_position || 0))
				.map((t: RustTabState) => t.id);

			appContext.editor.mruStack = sortedMru.length > 0 ? sortedMru : convertedTabs.map(t => t.id);

			switch (appContext.app.startupBehavior) {
				case 'first':
					appContext.app.activeTabId = convertedTabs[0].id;
					break;
				case 'last-focused':
					appContext.app.activeTabId = appContext.editor.mruStack[0] || convertedTabs[0].id;
					break;
				case 'new':
					appContext.app.activeTabId = addTab();
					break;
				default:
					appContext.app.activeTabId = convertedTabs[0].id;
			}

			const activeTab = appContext.editor.tabs.find(t => t.id === appContext.app.activeTabId);
			if (activeTab) {
				await initializeTabFileState(activeTab);
			}

		} else {
			appContext.app.activeTabId = addTab();
		}
	} catch (err) {
		AppError.handle('Session:Load', err, {
			showToast: false,
			severity: 'warning'
		});
		appContext.app.activeTabId = addTab();
	}
}

export const persistSessionDebounced = debounce(persistSession, CONFIG.SESSION.SAVE_DEBOUNCE_MS);
