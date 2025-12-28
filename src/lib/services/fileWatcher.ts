import { checkAndReloadIfChanged, reloadFileContent } from '$lib/services/fileMetadata';
import { appContext } from '$lib/stores/state.svelte.ts';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';
import { watch } from '@tauri-apps/plugin-fs';

type UnwatchFn = () => void;

class FileWatcherService {
	private watchers = new Map<string, { unwatch: UnwatchFn; refCount: number }>();
	private pendingChecks = new Set<string>();

	/**
	 * Start watching a file path for changes.
	 * Safe to call multiple times for the same path (increments ref count).
	 */
	async watch(path: string): Promise<void> {
		if (!path) return;

		if (this.watchers.has(path)) {
			const entry = this.watchers.get(path)!;
			entry.refCount++;
			return;
		}

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
	}

	/**
	 * Stop watching a file path.
	 * Decrements ref count and stops actual watcher when count reaches 0.
	 */
	unwatch(path: string): void {
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
			const tabs = appContext.editor.tabs.filter(t => t.path === path);

			for (const tab of tabs) {
				const hasChanged = await checkAndReloadIfChanged(tab.id);

				if (hasChanged) {
					if (tab.isDirty) {
						appContext.ui.toast.warning(
							`File changed on disk: ${tab.title}. You have unsaved changes.`,
							5000
						);
						// We can't update read-only props directly here if not using the store action,
						// but checkAndReloadIfChanged sets fileCheckFailed internally via store action.
					} else {
						await reloadFileContent(tab.id);
						appContext.ui.toast.info(`Reloaded ${tab.title} from disk`);
					}
				}
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
