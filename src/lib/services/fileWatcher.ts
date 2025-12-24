import { checkAndReloadIfChanged, reloadFileContent } from '$lib/services/fileMetadata';
import { editorStore } from '$lib/stores/editorStore.svelte';
import { toastStore } from '$lib/stores/toastStore.svelte';
import { debounce } from '$lib/utils/timing';
import { watch } from '@tauri-apps/plugin-fs';

type UnwatchFn = () => void;

class FileWatcherService {
    private watchers = new Map<string, { unwatch: UnwatchFn; refCount: number }>();
    private pendingChecks = new Set<string>();

    /**
     * Start watching a file path for changes.
     * safe to call multiple times for the same path (increments ref count).
     */
    async watch(path: string) {
        if (!path) return;

        if (this.watchers.has(path)) {
            const entry = this.watchers.get(path)!;
            entry.refCount++;
            return;
        }

        try {
            // Debounced handler to avoid double-firing on some OSs (like Windows)
            const handleChange = debounce(async () => {
                await this.handleFileChange(path);
            }, 300);

            const unwatch = await watch(path, (event) => {
                // We're interested in Modify (content change) or potentially Remove/Rename
                // The raw event might differ by OS, but usually just firing logic on any event is safe
                // if we verify with metadata afterwards.
                if (typeof event === 'object' && 'type' in event) {
                    // Filter specific event types if needed, or just catch all
                    handleChange();
                } else {
                    handleChange();
                }
            });

            this.watchers.set(path, { unwatch, refCount: 1 });
        } catch (err) {
            console.error(`[FileWatcher] Failed to watch ${path}:`, err);
        }
    }

    /**
     * Stop watching a file path.
     * Decrements ref count and stops actual watcher when count reaches 0.
     */
    unwatch(path: string) {
        if (!path || !this.watchers.has(path)) return;

        const entry = this.watchers.get(path)!;
        entry.refCount--;

        if (entry.refCount <= 0) {
            entry.unwatch();
            this.watchers.delete(path);
        }
    }

    private async handleFileChange(path: string) {
        // Prevent re-entry if we are already processing this path
        if (this.pendingChecks.has(path)) return;
        this.pendingChecks.add(path);

        try {
            // Find all tabs associated with this path
            const tabs = editorStore.tabs.filter(t => t.path === path);

            for (const tab of tabs) {
                // Check if the file has actually changed on disk vs our memory
                const hasChanged = await checkAndReloadIfChanged(tab.id);

                if (hasChanged) {
                    if (tab.isDirty) {
                        // Conflict: Disk changed, but user has unsaved changes
                        toastStore.warning(
                            `File changed on disk: ${tab.title}. You have unsaved changes.`,
                            5000
                        );
                        // Optional: Set a visual indicator on the tab
                        tab.fileCheckFailed = true;
                    } else {
                        // Clean state: Auto-reload content
                        await reloadFileContent(tab.id);
                        toastStore.info(`Reloaded ${tab.title} from disk`);
                    }
                }
            }
        } finally {
            this.pendingChecks.delete(path);
        }
    }

    /**
     * Clear all watchers (e.g., on app shutdown)
     */
    cleanup() {
        for (const entry of this.watchers.values()) {
            entry.unwatch();
        }
        this.watchers.clear();
    }
}

export const fileWatcher = new FileWatcherService();
