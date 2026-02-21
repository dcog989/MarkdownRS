import {
    checkAndReloadIfChanged,
    reloadFileContent,
    sanitizePath,
} from '$lib/services/fileMetadata';
import { reloadTabContent } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { CONFIG } from '$lib/utils/config';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';
import { watch } from '@tauri-apps/plugin-fs';

type UnwatchFn = () => void;

class FileWatcherService {
    private watchers = new Map<string, { unwatch: UnwatchFn; refCount: number }>();
    private pendingChecks = new Set<string>();
    private pendingWatchers = new Map<string, Promise<void>>();
    private abortControllers = new Map<string, AbortController>();
    private lastToastTime = new Map<string, number>();

    // Tracks paths currently being written to by the application
    private activeWriteLocks = new Set<string>();

    async watch(rawPath: string): Promise<void> {
        if (!rawPath) return;
        const path = sanitizePath(rawPath);

        if (this.watchers.has(path)) {
            const entry = this.watchers.get(path)!;
            entry.refCount++;
            return;
        }

        if (this.pendingWatchers.has(path)) {
            await this.pendingWatchers.get(path);
            if (this.watchers.has(path)) {
                this.watchers.get(path)!.refCount++;
            }
            return;
        }

        const controller = new AbortController();
        this.abortControllers.set(path, controller);

        const promise = (async () => {
            try {
                const handleChange = debounce(async () => {
                    if (controller.signal.aborted) return;
                    await this.handleFileChange(path, controller.signal);
                }, CONFIG.PERFORMANCE.FILE_WATCH_DEBOUNCE_MS);

                const unwatch = await watch(path, (_event) => {
                    if (controller.signal.aborted) return;
                    handleChange();
                });

                if (controller.signal.aborted) {
                    unwatch();
                    return;
                }

                this.watchers.set(path, { unwatch, refCount: 1 });
            } catch (err) {
                if (controller.signal.aborted) return;
                AppError.handle('FileWatcher:Watch', err, {
                    showToast: false,
                    severity: 'warning',
                    additionalInfo: { path },
                });
            } finally {
                this.abortControllers.delete(path);
            }
        })();

        this.pendingWatchers.set(path, promise);

        try {
            await promise;
        } finally {
            this.pendingWatchers.delete(path);
        }
    }

    unwatch(rawPath: string): void {
        const path = sanitizePath(rawPath);
        const controller = this.abortControllers.get(path);
        if (controller) {
            controller.abort();
        }

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
                    additionalInfo: { path },
                });
            }
            this.watchers.delete(path);
            this.lastToastTime.delete(path);
        }
    }

    /**
     * Explicitly locks a path to ignore file watcher events during internal writes.
     */
    setWriteLock(rawPath: string, locked: boolean) {
        const path = sanitizePath(rawPath);
        if (locked) {
            this.activeWriteLocks.add(path);
        } else {
            // Use a small buffer after the write completes to allow the OS
            // file system events to propagate and be discarded.
            setTimeout(() => {
                this.activeWriteLocks.delete(path);
            }, CONFIG.PERFORMANCE.FILE_WATCHER_LOCK_BUFFER_MS);
        }
    }

    private async handleFileChange(path: string, signal?: AbortSignal): Promise<void> {
        // Discard events if the app is currently writing to this file
        if (this.activeWriteLocks.has(path)) {
            return;
        }

        if (this.pendingChecks.has(path) || signal?.aborted) return;
        this.pendingChecks.add(path);

        try {
            const tabs = appContext.editor.tabs.filter((t) => t.path === path);
            if (tabs.length === 0 || signal?.aborted) {
                this.pendingChecks.delete(path);
                return;
            }

            const firstTab = tabs[0];
            const hasChanged = await checkAndReloadIfChanged(firstTab.id);

            if (!hasChanged || signal?.aborted) {
                this.pendingChecks.delete(path);
                return;
            }

            const dirtyTabs = tabs.filter((t) => t.isDirty);
            const cleanTabs = tabs.filter((t) => !t.isDirty);

            if (dirtyTabs.length > 0 && !signal?.aborted) {
                const tabNames = dirtyTabs.map((t) => t.title).join(', ');
                showToast(
                    'warning',
                    `File changed on disk: ${tabNames}. You have unsaved changes.`,
                    5000,
                );
            }

            if (cleanTabs.length > 0 && !signal?.aborted) {
                const firstTabStillExists = appContext.editor.tabs.some(
                    (t) => t.id === cleanTabs[0].id,
                );
                if (!firstTabStillExists || signal?.aborted) {
                    this.pendingChecks.delete(path);
                    return;
                }

                await reloadFileContent(cleanTabs[0].id);

                if (cleanTabs.length > 1 && !signal?.aborted) {
                    const reloadedTab = appContext.editor.tabs.find(
                        (t) => t.id === cleanTabs[0].id,
                    );
                    if (reloadedTab) {
                        for (let i = 1; i < cleanTabs.length; i++) {
                            if (signal?.aborted) break;

                            const tabStillExists = appContext.editor.tabs.some(
                                (t) => t.id === cleanTabs[i].id,
                            );
                            if (!tabStillExists) continue;

                            reloadTabContent(
                                cleanTabs[i].id,
                                reloadedTab.content,
                                reloadedTab.lineEnding,
                                reloadedTab.encoding,
                                reloadedTab.sizeBytes,
                            );
                        }
                    }
                }

                if (!signal?.aborted && !this.activeWriteLocks.has(path)) {
                    const now = Date.now();
                    const lastTime = this.lastToastTime.get(path) || 0;
                    const toastTimeLimit = 5000;
                    if (now - lastTime > toastTimeLimit) {
                        const tabNames = cleanTabs.map((t) => t.title).join(', ');
                        showToast('info', `Loaded ${tabNames} from disk`);
                        this.lastToastTime.set(path, now);
                    }
                }
            }
        } catch (err) {
            if (signal?.aborted) return;
            AppError.handle('FileWatcher:Watch', err, {
                showToast: false,
                severity: 'warning',
                additionalInfo: { path },
            });
        } finally {
            this.pendingChecks.delete(path);
        }
    }

    cleanup(): void {
        for (const controller of this.abortControllers.values()) {
            controller.abort();
        }
        this.abortControllers.clear();

        for (const [path, entry] of this.watchers.entries()) {
            try {
                entry.unwatch();
            } catch (err) {
                AppError.handle('FileWatcher:Unwatch', err, {
                    showToast: false,
                    severity: 'warning',
                    additionalInfo: { path },
                });
            }
        }
        this.watchers.clear();
        this.activeWriteLocks.clear();
        this.lastToastTime.clear();
    }
}

export const fileWatcher = new FileWatcherService();
