import { type WatchEvent, watchImmediate } from "@tauri-apps/plugin-fs";
import { translate } from "$lib/i18n";
import { hasFileChanged, reloadFileContent, sanitizePath } from "$lib/services/fileMetadata";
import { reloadTabContent } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import { showToast } from "$lib/stores/toastStore.svelte";
import { CONFIG } from "$lib/utils/config";
import { AppError } from "$lib/utils/errorHandling";
import { debounce } from "$lib/utils/timing";

type UnwatchFn = () => void;

const TOAST_THROTTLE_MS = 5000;

function isAccessEvent(event: WatchEvent): boolean {
  return typeof event.type === "object" && event.type !== null && "access" in event.type;
}

class FileWatcherService {
  private watchers = new Map<string, UnwatchFn>();
  private tabCounts = new Map<string, number>();
  private watchPromises = new Map<string, Promise<void>>();
  private pendingChecks = new Set<string>();
  private writeLocks = new Map<string, number>();
  private lastToastTime = new Map<string, number>();
  private renewInFlight = new Set<string>();
  private renewQueued = new Set<string>();

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
      AppError.handle("FileWatcher:Watch", err, {
        showToast: false,
        severity: "warning",
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
          AppError.handle("FileWatcher:Unwatch", err, {
            showToast: false,
            severity: "warning",
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
    const handleEvent = debounce(async () => {
      await this.handleFileChange(path);
      // The notify file watch is bound to the file's inode. Atomic saves
      // (temp-file + rename) replace the inode, which silently kills the watch
      // (inotify DELETE_SELF / kqueue NOTE_DELETE). Re-arm after every event so
      // external edits keep being detected; saveFile() also re-arms immediately
      // after its own write, so this is the backstop for external writers.
      void this.renew(path);
    }, CONFIG.PERFORMANCE.FILE_WATCH_DEBOUNCE_MS);

    // Immediate delivery (no plugin debounce): the default `watch` batched
    // events 2s later, which always landed after our 700ms write lock and so
    // the app reacted to its own saves as if they were external edits. Events
    // now arrive promptly and the write lock + the 300ms debounce below
    // suppress self-writes while still coalescing genuine edit bursts.
    const unwatch = await watchImmediate(path, (event) => {
      // The inotify watch mask includes OPEN, so every read_text_file (which
      // opens the file for reading) emits an access event. Reacting to those
      // would turn our own change-probe reads into a self-sustaining loop of
      // read events. Real edits always also emit a Modify event, so access
      // events can be dropped without missing external changes.
      if (isAccessEvent(event)) return;
      handleEvent();
    });

    if (!this.tabCounts.has(path)) {
      unwatch();
      return;
    }

    this.watchers.set(path, unwatch);
  }

  /**
   * Re-arms the watcher for a path whose inode was replaced (atomic save /
   * external rename-over). The notify file watch dies with the old inode, so a
   * fresh watch must be registered on the new one. Tearing down the stale
   * watcher first keeps the plugin resource count flat.
   */
  async renew(rawPath: string): Promise<void> {
    const path = sanitizePath(rawPath);
    if (!path || !this.tabCounts.has(path)) return;

    if (this.renewInFlight.has(path)) {
      // A re-arm is mid-setup; coalesce so we don't stack concurrent watchers.
      this.renewQueued.add(path);
      return;
    }
    this.renewInFlight.add(path);

    try {
      const oldUnwatch = this.watchers.get(path);
      this.watchers.delete(path);
      if (oldUnwatch) {
        try {
          oldUnwatch();
        } catch (err) {
          AppError.handle("FileWatcher:Unwatch", err, {
            showToast: false,
            severity: "warning",
            additionalInfo: { path },
          });
        }
      }

      if (!this.watchPromises.has(path)) {
        this.watchPromises.set(path, this.setupWatcher(path));
      }
      await this.watchPromises.get(path);
    } catch (err) {
      // File may have been deleted externally; a later save or reopen re-arms.
      AppError.handle("FileWatcher:Watch", err, {
        showToast: false,
        severity: "warning",
        additionalInfo: { path },
      });
    } finally {
      this.watchPromises.delete(path);
      this.renewInFlight.delete(path);
      if (this.renewQueued.has(path)) {
        this.renewQueued.delete(path);
        void this.renew(path);
      }
    }
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

      const probeTab = tabs.find((t) => !t.isDirty) ?? tabs[0];
      const hasChanged = await hasFileChanged(probeTab.id);
      if (!hasChanged) return;

      const dirtyTabs = tabs.filter((t) => t.isDirty);
      const cleanTabs = tabs.filter((t) => !t.isDirty);

      if (dirtyTabs.length > 0) {
        const tabNames = dirtyTabs.map((t) => t.title).join(", ");
        showToast(
          "warning",
          translate("fileOps.fileChangedOnDisk", { values: { tabs: tabNames } }),
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
                reloadedTab.hasBom,
              );
            }
          }
        }

        const now = Date.now();
        const lastTime = this.lastToastTime.get(path) ?? 0;
        if (now - lastTime > TOAST_THROTTLE_MS) {
          const tabNames = cleanTabs.map((t) => t.title).join(", ");
          showToast("info", translate("fileOps.loadedFromDisk", { values: { tabs: tabNames } }));
          this.lastToastTime.set(path, now);
        }
      }
    } catch (err) {
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
    for (const unwatch of this.watchers.values()) {
      try {
        unwatch();
      } catch (err) {
        AppError.handle("FileWatcher:Unwatch", err, {
          showToast: false,
          severity: "warning",
          additionalInfo: { path: "unknown" },
        });
      }
    }
    this.watchers.clear();
    this.tabCounts.clear();
    this.watchPromises.clear();
    this.writeLocks.clear();
    this.lastToastTime.clear();
    this.pendingChecks.clear();
    this.renewInFlight.clear();
    this.renewQueued.clear();
  }
}

export const fileWatcher = new FileWatcherService();
