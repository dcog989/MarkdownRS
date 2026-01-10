import { checkAndReloadIfChanged, reloadFileContent } from "$lib/services/fileMetadata";
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

    async watch(path: string): Promise<void> {
        if (!path) return;

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

    unwatch(path: string): void {
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

    private async handleFileChange(path: string, signal?: AbortSignal): Promise<void> {
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
                    showToast("info", `Reloaded ${tabNames} from disk`);
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
    }
}

export const fileWatcher = new FileWatcherService();
