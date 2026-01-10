import { checkAndReloadIfChanged, reloadFileContent, sanitizePath } from "$lib/services/fileMetadata";
import { reloadTabContent } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte.ts";
import { showToast } from "$lib/stores/toastStore.svelte";
import { AppError } from "$lib/utils/errorHandling";
import { debounce } from "$lib/utils/timing";
import { watch } from "@tauri-apps/plugin-fs";

type UnwatchFn = () => void;

class FileWatcherService {
    private watchers = new Map<string, { unwatch: UnwatchFn; refCount: number }>();
    private pendingChecks = new Set<string>();
    private pendingWatchers = new Map<string, Promise<void>>();
    private abortControllers = new Map<string, AbortController>();

    // Tracks paths that should be ignored temporarily (e.g. during internal saves)
    private suspendedPaths = new Map<string, number>();

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
                }, 300);

                // Note: We watch the sanitized path. Ensure Tauri/OS accepts forward slashes on Windows (usually yes).
                // If not, we might need platform-specific normalization, but sanitizePath is widely used in this app.
                const unwatch = await watch(path, (event) => {
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
                AppError.handle("FileWatcher:Watch", err, {
                    showToast: false,
                    severity: "warning",
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
                AppError.handle("FileWatcher:Unwatch", err, {
                    showToast: false,
                    severity: "warning",
                    additionalInfo: { path },
                });
            }
            this.watchers.delete(path);
        }
    }

    /**
     * Temporarily suspends watcher checks for a specific path.
     * Use this before performing internal file write operations.
     * @param rawPath The file path to ignore
     * @param duration Duration in ms to ignore changes (default 2000ms)
     */
    suspendWatcher(rawPath: string, duration: number = 2000) {
        const path = sanitizePath(rawPath);
        const expiry = Date.now() + duration;
        this.suspendedPaths.set(path, Math.max(this.suspendedPaths.get(path) || 0, expiry));

        // Cleanup map to prevent growth
        setTimeout(() => {
            const current = this.suspendedPaths.get(path);
            if (current && current <= expiry) {
                this.suspendedPaths.delete(path);
            }
        }, duration + 100);
    }

    private async handleFileChange(path: string, signal?: AbortSignal): Promise<void> {
        // Check if path is currently suspended
        const suspendedUntil = this.suspendedPaths.get(path);
        if (suspendedUntil && Date.now() < suspendedUntil) {
            return;
        }

        if (this.pendingChecks.has(path) || signal?.aborted) return;
        this.pendingChecks.add(path);

        try {
            // Compare against tab paths (which should also be sanitized in store)
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
                const tabNames = dirtyTabs.map((t) => t.title).join(", ");
                showToast(
                    "warning",
                    `File changed on disk: ${tabNames}. You have unsaved changes.`,
                    5000
                );
            }

            if (cleanTabs.length > 0 && !signal?.aborted) {
                // Validate first tab still exists before reloading
                const firstTabStillExists = appContext.editor.tabs.some(
                    (t) => t.id === cleanTabs[0].id
                );
                if (!firstTabStillExists || signal?.aborted) {
                    this.pendingChecks.delete(path);
                    return;
                }

                await reloadFileContent(cleanTabs[0].id);

                if (cleanTabs.length > 1 && !signal?.aborted) {
                    const reloadedTab = appContext.editor.tabs.find(
                        (t) => t.id === cleanTabs[0].id
                    );
                    if (reloadedTab) {
                        for (let i = 1; i < cleanTabs.length; i++) {
                            if (signal?.aborted) break;

                            // Validate each tab still exists before reloading
                            const tabStillExists = appContext.editor.tabs.some(
                                (t) => t.id === cleanTabs[i].id
                            );
                            if (!tabStillExists) continue;

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

                if (!signal?.aborted) {
                    const tabNames = cleanTabs.map((t) => t.title).join(", ");
                    showToast("info", `Loaded ${tabNames} from disk`);
                }
            }
        } catch (err) {
            if (signal?.aborted) return;
            AppError.handle("FileWatcher:Watch", err, {
                showToast: false,
                severity: "warning",
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
                AppError.handle("FileWatcher:Unwatch", err, {
                    showToast: false,
                    severity: "warning",
                    additionalInfo: { path },
                });
            }
        }
        this.watchers.clear();
        this.suspendedPaths.clear();
    }
}

export const fileWatcher = new FileWatcherService();
