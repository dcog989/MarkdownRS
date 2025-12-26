import { appState } from '$lib/stores/appState.svelte.ts';
import { editorStore, type EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { callBackend } from '$lib/utils/backend';
import { formatTimestampForDisplay } from '$lib/utils/date';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';
import { checkFileExists, normalizeLineEndings, refreshMetadata } from './fileMetadata';
import { fileWatcher } from './fileWatcher';

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
};

type FileContent = {
	content: string;
	encoding: string;
};

let isSaving = false;
let saveQueue: (() => Promise<void>)[] = [];

async function processSaveQueue() {
	while (saveQueue.length > 0) {
		const saveTask = saveQueue.shift();
		if (saveTask) {
			try {
				await saveTask();
			} catch (err) {
				// Error already logged by callBackend
			}
		}
	}
	isSaving = false;
}

/**
 * Initializes a single tab's file state:
 * - Reloads content if dirty and changed on disk (safety check)
 * - Refreshes metadata
 * - Checks existence
 * - Sets up watcher
 */
async function initializeTabFileState(tab: EditorTab): Promise<void> {
	if (!tab.path) return;

	// If tab is dirty, reload the saved content to detect changes
	if (tab.isDirty) {
		try {
			const res = await callBackend<FileContent>(
				'read_text_file',
				{ path: tab.path },
				'File:Read'
			);
			const storeTab = editorStore.tabs.find(x => x.id === tab.id);
			if (storeTab) {
				storeTab.lastSavedContent = normalizeLineEndings(res.content);
				storeTab.isDirty = storeTab.content !== storeTab.lastSavedContent;
			}
		} catch (err) {
			// Silently handle - file might not exist anymore
			AppError.handle('File:Read', err, {
				showToast: false,
				severity: 'warning',
				additionalInfo: { path: tab.path }
			});
		}
	}

	// Refresh metadata and check file existence
	await refreshMetadata(tab.id, tab.path);
	await checkFileExists(tab.id);

	// Watch file for changes
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
	if (!editorStore.sessionDirty) return;

	const saveTask = async () => {
		try {
			const mruPositionMap = new Map<string, number>();
			editorStore.mruStack.forEach((tabId, index) => mruPositionMap.set(tabId, index));

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
				custom_title: t.customTitle || null,
				file_check_failed: t.fileCheckFailed || false,
				file_check_performed: t.fileCheckPerformed || false,
				mru_position: mruPositionMap.get(t.id) ?? null
			}));

			editorStore.sessionDirty = false;
			await callBackend('save_session', { tabs: plainTabs }, 'Session:Save');
		} catch (err) {
			editorStore.sessionDirty = true;
			// Log error but don't show toast for background session saves
			AppError.handle('Session:Save', err, {
				showToast: false,
				severity: 'warning'
			});
			throw err;
		}
	};

	if (isSaving) {
		// Add to queue if a save is already in progress
		saveQueue.push(saveTask);
		return;
	}

	isSaving = true;
	try {
		await saveTask();
		await processSaveQueue();
	} catch (err) {
		isSaving = false;
	}
}

export async function loadSession(): Promise<void> {
	try {
		const rustTabs = await callBackend<RustTabState[]>('restore_session', {}, 'Session:Load');
		if (rustTabs && rustTabs.length > 0) {
			const convertedTabs: EditorTab[] = rustTabs.map(t => {
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

			editorStore.tabs = convertedTabs;

			const sortedMru = rustTabs
				.filter(t => t.mru_position !== null && t.mru_position !== undefined)
				.sort((a, b) => (a.mru_position || 0) - (b.mru_position || 0))
				.map(t => t.id);

			editorStore.mruStack = sortedMru.length > 0 ? sortedMru : convertedTabs.map(t => t.id);

			switch (appState.startupBehavior) {
				case 'first':
					appState.activeTabId = convertedTabs[0].id;
					break;
				case 'last-focused':
					appState.activeTabId = editorStore.mruStack[0] || convertedTabs[0].id;
					break;
				case 'new':
					appState.activeTabId = editorStore.addTab();
					break;
				default:
					appState.activeTabId = convertedTabs[0].id;
			}

			// 1. Process the active tab immediately so user sees data ASAP
			const activeTab = editorStore.tabs.find(t => t.id === appState.activeTabId);
			if (activeTab) {
				await initializeTabFileState(activeTab);
			}

			// 2. Process remaining tabs in the background, staggered to prevent I/O spike
			const remainingTabs = editorStore.tabs.filter(t => t.id !== appState.activeTabId);

			(async () => {
				for (const tab of remainingTabs) {
					// Check if tab is still open before processing (user might have closed it during the delay)
					if (!editorStore.tabs.some(t => t.id === tab.id)) continue;

					await initializeTabFileState(tab);

					// Small delay to allow UI event loop to breathe between file operations
					await new Promise(resolve => setTimeout(resolve, 50));
				}
			})();

		} else {
			// No session to restore, create new tab
			appState.activeTabId = editorStore.addTab();
		}
	} catch (err) {
		// Failed to load session, create new tab
		AppError.handle('Session:Load', err, {
			showToast: false,
			severity: 'warning'
		});
		appState.activeTabId = editorStore.addTab();
	}
}

export const persistSessionDebounced = debounce(persistSession, 500);
