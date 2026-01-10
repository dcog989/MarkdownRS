import { checkAndReloadIfChanged, reloadFileContent } from '$lib/services/fileMetadata';
import { reloadTabContent } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';
import { watch } from '@tauri-apps/plugin-fs';

type UnwatchFn = () => void;

class FileWatcherService {
	private watchers = new Map<string, { unwatch: UnwatchFn; refCount: number }>();
	private pendingChecks = new Set<string>();
	private pendingWatchers = new Map<string, Promise<void>>();

	/**
	 * Start watching a file path for changes.
	 * Safe to call multiple times for the same path (increments ref count).
	 */
	async watch(path: string): Promise<void> {
		if (!path) return;

		// 1. Check active watchers
		if (this.watchers.has(path)) {
			const entry = this.watchers.get(path)!;
			entry.refCount++;
			return;
		}

		// 2. Check pending operations
		if (this.pendingWatchers.has(path)) {
			await this.pendingWatchers.get(path);
			if (this.watchers.has(path)) {
				this.watchers.get(path)!.refCount++;
			}
			return;
		}

		// 3. Initiate new watch
		const promise = (async () => {
			try {
				const handleChange = debounce(async () => {
					await this.handleFileChange(path);
				}, 300);

				const unwatch = await watch(path, (event) => {
					if (typeof event === 'object' && 'type' in event) {
						handleChange();
					} else {
						handleChange();
					}
				});

				this.watchers.set(path, { unwatch, refCount: 1 });
			} catch (err) {
				AppError.handle('FileWatcher:Watch', err, {
					showToast: false,
					severity: 'warning',
					additionalInfo: { path }
				});
			}
		})();

		this.pendingWatchers.set(path, promise);

		try {
			await promise;
		} finally {
			this.pendingWatchers.delete(path);
		}
	}

	/**
	 * Stop watching a file path.
	 * Decrements ref count and stops actual watcher when count reaches 0.
	 */
	unwatch(path: string): void {
		// If a watch is pending, chain a cleanup
		if (this.pendingWatchers.has(path)) {
			this.pendingWatchers.get(path)?.then(() => {
				this.unwatch(path);
			});
			return;
		}

		if (!path || !this.watchers.has(path)) return;

		const entry = this.watchers.get(path)!;
		entry.refCount--;

		if (entry.refCount <= 0) {
			try {
				entry.unwatch();
			} catch (err) {
				AppError.handle('FileWatcher:Unwatch', err, {
					showToast: false,
					severity: 'warning',
					additionalInfo: { path }
				});
			}
			this.watchers.delete(path);
		}
	}

	private async handleFileChange(path: string): Promise<void> {
		if (this.pendingChecks.has(path)) return;
		this.pendingChecks.add(path);

		try {
			// Get all tabs with this path
			const tabs = appContext.editor.tabs.filter(t => t.path === path);
			if (tabs.length === 0) {
				this.pendingChecks.delete(path);
				return;
			}

			// Single metadata check for all tabs with the same path
			const firstTab = tabs[0];
			const hasChanged = await checkAndReloadIfChanged(firstTab.id);

			if (!hasChanged) {
				this.pendingChecks.delete(path);
				return;
			}

			// File has changed - check if any tabs are dirty
			const dirtyTabs = tabs.filter(t => t.isDirty);
			const cleanTabs = tabs.filter(t => !t.isDirty);

			if (dirtyTabs.length > 0) {
				// Show warning for dirty tabs (once, not per tab)
				const tabNames = dirtyTabs.map(t => t.title).join(', ');
				showToast(
					'warning',
					`File changed on disk: ${tabNames}. You have unsaved changes.`,
					5000
				);
			}

			if (cleanTabs.length > 0) {
				// Reload content once, then apply to all clean tabs
				await reloadFileContent(cleanTabs[0].id);

				// Apply the reloaded content to other clean tabs with same path
				if (cleanTabs.length > 1) {
					const reloadedTab = appContext.editor.tabs.find(t => t.id === cleanTabs[0].id);
					if (reloadedTab) {
						for (let i = 1; i < cleanTabs.length; i++) {
							reloadTabContent(
								cleanTabs[i].id,
								reloadedTab.content,
								reloadedTab.lineEnding,
								reloadedTab.encoding,
								reloadedTab.sizeBytes
							);
						}
					}
				}

				const tabNames = cleanTabs.map(t => t.title).join(', ');
				showToast('info', `Reloaded ${tabNames} from disk`);
			}
		} catch (err) {
			AppError.handle('FileWatcher:Watch', err, {
				showToast: false,
				severity: 'warning',
				additionalInfo: { path }
			});
		} finally {
			this.pendingChecks.delete(path);
		}
	}

	cleanup(): void {
		for (const [path, entry] of this.watchers.entries()) {
			try {
				entry.unwatch();
			} catch (err) {
				AppError.handle('FileWatcher:Unwatch', err, {
					showToast: false,
					severity: 'warning',
					additionalInfo: { path }
				});
			}
		}
		this.watchers.clear();
	}
}

export const fileWatcher = new FileWatcherService();
