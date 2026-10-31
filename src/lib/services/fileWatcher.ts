import { type WatchEvent, watchImmediate } from "@tauri-apps/plugin-fs";
import { translate } from "$lib/i18n";
import { hasFileChanged, reloadFileContent, sanitizePath } from "$lib/services/fileMetadata";
import { updateTransientState } from "$lib/stores/editorStore.svelte";
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
  /** Which tabs reference a path. Keyed by tab id so repeated arms from one tab are a no-op. */
  private tabPaths = new Map<string, string>();
  private pathTabs = new Map<string, Set<string>>();
  private watchPromises = new Map<string, Promise<void>>();
  private pendingChecks = new Set<string>();
  private writeLocks = new Map<string, number>();
  private lastToastTime = new Map<string, number>();
  private renewInFlight = new Set<string>();
  private renewQueued = new Set<string>();
  /** Pending re-checks for paths whose change event landed inside a write lock. */
  private retryTimers = new Map<string, number>();

  async watch(tabId: string, rawPath: string): Promise<void> {
    if (!tabId || !rawPath) return;
    const path = sanitizePath(rawPath);

    if (this.tabPaths.get(tabId) === path) return;
    if (this.tabPaths.has(tabId)) this.unwatch(tabId);

    this.tabPaths.set(tabId, path);
    const tabIds = this.pathTabs.get(path) ?? new Set<string>();
    this.pathTabs.set(path, tabIds);
    const isFirstTab = tabIds.size === 0;
    tabIds.add(tabId);

    if (!isFirstTab) return;

    if (!this.watchPromises.has(path)) {
      this.watchPromises.set(path, this.setupWatcher(path));
    }

    try {
      await this.watchPromises.get(path);
    } catch (err) {
      this.unwatch(tabId);
      AppError.handle("FileWatcher:Watch", err, {
        showToast: false,
        severity: "warning",
        additionalInfo: { path },
      });
    } finally {
      this.watchPromises.delete(path);
    }
  }

  unwatch(tabId: string): void {
    const path = this.tabPaths.get(tabId);
    if (!path) return;
    this.tabPaths.delete(tabId);

    const tabIds = this.pathTabs.get(path);
    if (!tabIds) return;
    tabIds.delete(tabId);
    if (tabIds.size > 0) return;

    this.pathTabs.delete(path);
    this.lastToastTime.delete(path);
    this.clearRetry(path);

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
  }

  setWriteLock(rawPath: string, locked: boolean) {
    const path = sanitizePath(rawPath);
    if (locked) {
      this.writeLocks.set(path, -1);
    } else if (this.writeLocks.has(path)) {
      this.writeLocks.set(path, Date.now() + CONFIG.PERFORMANCE.FILE_WATCHER_LOCK_BUFFER_MS);
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

    if (!this.pathTabs.has(path)) {
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
    if (!path || !this.pathTabs.has(path)) return;

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

  /**
   * A change event that arrives while the app's own save holds the lock is
   * ignored, but it may have been an external write. Re-check once the lock
   * expires so that edit is not lost until the next event.
   */
  private scheduleRecheck(path: string): void {
    if (!this.pathTabs.has(path) || this.retryTimers.has(path)) return;

    const expiry = this.writeLocks.get(path);
    const delay =
      expiry === -1 || expiry === undefined
        ? CONFIG.PERFORMANCE.FILE_WATCHER_LOCK_BUFFER_MS
        : Math.max(0, expiry - Date.now());

    this.retryTimers.set(
      path,
      window.setTimeout(() => {
        this.retryTimers.delete(path);
        void this.handleFileChange(path);
      }, delay),
    );
  }

  private clearRetry(path: string): void {
    const timer = this.retryTimers.get(path);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.retryTimers.delete(path);
  }

  private async handleFileChange(path: string): Promise<void> {
    if (this.isWriteLocked(path)) {
      this.scheduleRecheck(path);
      return;
    }
    if (this.pendingChecks.has(path)) return;
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
        // The disk baseline these tabs were checked against is now stale.
        for (const t of dirtyTabs) updateTransientState(t.id, { fileCheckPerformed: false });
      }

      if (cleanTabs.length > 0) {
        // Reload each tab instead of copying the first tab's text into the
        // rest: reloadFileContent re-checks per tab, so a tab the user edited
        // while an earlier reload was in flight keeps its buffer.
        for (const tab of cleanTabs) {
          if (!appContext.editor.tabs.some((t) => t.id === tab.id)) continue;
          await reloadFileContent(tab.id);
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
}

export const fileWatcher = new FileWatcherService();
