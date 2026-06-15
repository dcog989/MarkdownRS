import { watch } from '@tauri-apps/plugin-fs';
import { checkAndReloadIfChanged, reloadFileContent, sanitizePath } from '$lib/services/fileMetadata';
import { reloadTabContent } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { CONFIG } from '$lib/utils/config';
import { AppError } from '$lib/utils/errorHandling';
import { debounce } from '$lib/utils/timing';

type UnwatchFn = () => void;

const TOAST_THROTTLE_MS = 5000;

class FileWatcherService {
  private watchers = new Map<string, UnwatchFn>();
  private tabCounts = new Map<string, number>();
  private watchPromises = new Map<string, Promise<void>>();
  private pendingChecks = new Set<string>();
  private writeLocks = new Map<string, number>();
  private lastToastTime = new Map<string, number>();

  async watch(rawPath: string): Promise<void> {
    if (!rawPath) return;
    const path = sanitizePath(rawPath);

    const currentCount = this.tabCounts.get(path) ?? 0;
    this.tabCounts.set(path, currentCount + 1);

    if (currentCount > 0) return;

    if (!this.watchPromises.has(path)) {
      this.watchPromises.set(path, this.setupWatcher(path));
    }

    try {
      await this.watchPromises.get(path);
    } catch (err) {
      this.decrementTabCount(path);
      AppError.handle('FileWatcher:Watch', err, {
        showToast: false,
        severity: 'warning',
        additionalInfo: { path },
      });
    } finally {
      this.watchPromises.delete(path);
    }
  }

  unwatch(rawPath: string): void {
    const path = sanitizePath(rawPath);
    if (!path) return;
    this.decrementTabCount(path);
  }

  setWriteLock(rawPath: string, locked: boolean) {
    const path = sanitizePath(rawPath);
    if (locked) {
      this.writeLocks.set(path, -1);
    } else if (this.writeLocks.has(path)) {
      this.writeLocks.set(path, Date.now() + CONFIG.PERFORMANCE.FILE_WATCHER_LOCK_BUFFER_MS);
    }
  }

  private decrementTabCount(path: string): void {
    const count = (this.tabCounts.get(path) ?? 0) - 1;

    if (count <= 0) {
      this.tabCounts.delete(path);
      this.lastToastTime.delete(path);

      const unwatch = this.watchers.get(path);
      if (unwatch) {
        try {
          unwatch();
        } catch (err) {
          AppError.handle('FileWatcher:Unwatch', err, {
            showToast: false,
            severity: 'warning',
            additionalInfo: { path },
          });
        }
        this.watchers.delete(path);
      }
    } else {
      this.tabCounts.set(path, count);
    }
  }

  private async setupWatcher(path: string): Promise<void> {
    const handleChange = debounce(async () => {
      await this.handleFileChange(path);
    }, CONFIG.PERFORMANCE.FILE_WATCH_DEBOUNCE_MS);

    const unwatch = await watch(path, () => {
      handleChange();
    });

    if (!this.tabCounts.has(path)) {
      unwatch();
      return;
    }

    this.watchers.set(path, unwatch);
  }

  private isWriteLocked(path: string): boolean {
    const expiry = this.writeLocks.get(path);
    if (expiry === undefined) return false;
    if (expiry === -1) return true;
    if (Date.now() >= expiry) {
      this.writeLocks.delete(path);
      return false;
    }
    return true;
  }

  private async handleFileChange(path: string): Promise<void> {
    if (this.isWriteLocked(path) || this.pendingChecks.has(path)) return;
    this.pendingChecks.add(path);

    try {
      const tabs = appContext.editor.tabs.filter((t) => t.path === path);
      if (tabs.length === 0) return;

      const firstTab = tabs[0];
      const hasChanged = await checkAndReloadIfChanged(firstTab.id);
      if (!hasChanged) return;

      const dirtyTabs = tabs.filter((t) => t.isDirty);
      const cleanTabs = tabs.filter((t) => !t.isDirty);

      if (dirtyTabs.length > 0) {
        const tabNames = dirtyTabs.map((t) => t.title).join(', ');
        showToast(
          'warning',
          `File changed on disk: ${tabNames}. You have unsaved changes.`,
          CONFIG.UI.TOAST_DURATION_MS,
        );
      }

      if (cleanTabs.length > 0) {
        if (!appContext.editor.tabs.some((t) => t.id === cleanTabs[0].id)) return;

        await reloadFileContent(cleanTabs[0].id);

        if (cleanTabs.length > 1) {
          const reloadedTab = appContext.editor.tabs.find((t) => t.id === cleanTabs[0].id);
          if (reloadedTab) {
            for (let i = 1; i < cleanTabs.length; i++) {
              if (!appContext.editor.tabs.some((t) => t.id === cleanTabs[i].id)) continue;

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

        const now = Date.now();
        const lastTime = this.lastToastTime.get(path) ?? 0;
        if (now - lastTime > TOAST_THROTTLE_MS) {
          const tabNames = cleanTabs.map((t) => t.title).join(', ');
          showToast('info', `Loaded ${tabNames} from disk`);
          this.lastToastTime.set(path, now);
        }
      }
    } catch (err) {
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
    for (const unwatch of this.watchers.values()) {
      try {
        unwatch();
      } catch (err) {
        AppError.handle('FileWatcher:Unwatch', err, {
          showToast: false,
          severity: 'warning',
          additionalInfo: { path: 'unknown' },
        });
      }
    }
    this.watchers.clear();
    this.tabCounts.clear();
    this.watchPromises.clear();
    this.writeLocks.clear();
    this.lastToastTime.clear();
    this.pendingChecks.clear();
  }
}

export const fileWatcher = new FileWatcherService();
