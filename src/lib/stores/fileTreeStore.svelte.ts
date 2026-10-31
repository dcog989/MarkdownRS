import { SvelteMap } from "svelte/reactivity";
import { getDirectoryMtime, listDirectory } from "$lib/commands/directory";
import {
  settingsState,
  toggleFileTreeShowHidden,
  toggleFileTreeShowMarkdownOnly,
} from "$lib/stores/settingsState.svelte";
import type { FileEntry } from "$lib/types/api";
import { MARKDOWN_EXTENSION_SET } from "$lib/utils/fileValidation";
import { basename, dirname, normalizePath } from "$lib/utils/path";

export { basename, dirname };

export const fileTreeStore = $state({
  root: "",
  expanded: new SvelteMap<string, boolean>(),
  children: new SvelteMap<string, FileEntry[]>(),
  loading: new SvelteMap<string, boolean>(),
  refreshing: false,
  // Tracks when each directory's children were last fetched and the directory
  // mtime seen at that point, so the background poll can skip unchanged dirs.
  lastLoaded: new Map<string, number>(),
  dirMtimes: new Map<string, number>(),
});

// Directories are re-listed lazily on user interaction (expanding a folder,
// navigating, switching tabs, saving) rather than on a timer. When a directory
// mtime is unavailable this freshness threshold prevents re-listing on every
// expand, so a directory is only re-listed once per interval at most.
export const STALE_REFRESH_MS = 30_000;

// Tracks the latest in-flight listing generation per directory so stale results
// from an outdated request (e.g. after toggling hidden files) are discarded.
// The counter only grows, so a dropped entry can never collide with a later load.
let lastLoadGeneration = 0;
const loadGeneration = new Map<string, number>();

function nextLoadGeneration(path: string): number {
  const generation = ++lastLoadGeneration;
  loadGeneration.set(path, generation);
  return generation;
}

// In-flight listing promises, shared so callers awaiting an already-running
// load (e.g. revealPath right after a follow-mode root change) actually wait
// for it instead of returning immediately.
const inFlightLoads = new Map<string, Promise<void>>();

function invalidateLoads(): void {
  // Absent keys are enough to discard in-flight results: each load carries a
  // number that can never be issued again. Callers clear the loading flags.
  loadGeneration.clear();
  fileTreeStore.lastLoaded.clear();
  fileTreeStore.dirMtimes.clear();
}

export function setRoot(path: string): void {
  const root = normalizePath(path);
  fileTreeStore.root = root;
  fileTreeStore.expanded.clear();
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  fileTreeStore.expanded.set(root, true);
  void loadChildren(root);
}

// While suspended, the tree ignores changes of the active document. Batch
// saves flip the active tab once per file (saveCurrentFile works on the active
// tab), which would otherwise re-root the tree and wipe its expanded folders
// on every save.
export const treeFollowState = $state({ suspended: false });

// Bumped when a cached listing changes under an active filter (rename,
// delete, in-place refresh) so the whole-tree search re-runs with fresh data
// instead of leaving rows for paths that no longer exist.
export const treeRevision = $state({ value: 0 });

export async function suspendTreeFollow<T>(operation: () => Promise<T>): Promise<T> {
  treeFollowState.suspended = true;
  try {
    return await operation();
  } finally {
    treeFollowState.suspended = false;
  }
}

export function loadChildren(path: string, force = false): Promise<void> {
  if (!force && fileTreeStore.loading.get(path)) {
    return inFlightLoads.get(path) ?? Promise.resolve();
  }
  if (!force && fileTreeStore.children.has(path)) return Promise.resolve();

  const generation = nextLoadGeneration(path);
  fileTreeStore.loading.set(path, true);

  const promise = (async () => {
    try {
      const entries = await listDirectory(path, settingsState.fileTreeShowHidden);
      if (loadGeneration.get(path) !== generation) return;
      // Rust reports native paths, so normalize `\` here: tab paths and the
      // prefix checks in refresh/reveal all use `/`.
      fileTreeStore.children.set(
        path,
        entries.map((entry) => ({ ...entry, path: normalizePath(entry.path) })),
      );
      fileTreeStore.lastLoaded.set(path, Date.now());
    } catch {
      // Keep the previous listing on a failed refresh, so a transient error
      // does not blank the folder. A first load has no listing to keep.
    } finally {
      if (loadGeneration.get(path) === generation) {
        fileTreeStore.loading.set(path, false);
      }
    }
  })();

  inFlightLoads.set(path, promise);
  promise
    .finally(() => {
      if (inFlightLoads.get(path) === promise) {
        inFlightLoads.delete(path);
      }
    })
    .catch(() => {});
  return promise;
}

export function isExpanded(path: string): boolean {
  return fileTreeStore.expanded.get(path) ?? false;
}

export function isDirLoading(path: string): boolean {
  return fileTreeStore.loading.get(path) ?? false;
}

export async function toggle(path: string): Promise<void> {
  if (isExpanded(path)) {
    fileTreeStore.expanded.set(path, false);
    return;
  }
  fileTreeStore.expanded.set(path, true);
  if (fileTreeStore.children.has(path)) {
    // A previously loaded folder may be stale on disk; re-list it lazily only
    // if its mtime changed since it was last seen.
    if (await directoryNeedsRefresh(path)) {
      await refreshPath(path);
    }
    return;
  }
  await loadChildren(path);
}

export function toggleHiddenFiles(): void {
  toggleFileTreeShowHidden();
  // Re-list every expanded folder, not just the root: the cache keys survive
  // the clear, so an expanded subfolder would otherwise render empty until it
  // is collapsed and reopened.
  const expandedPaths = [...fileTreeStore.expanded.keys()].filter((path) => fileTreeStore.expanded.get(path));
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  for (const path of expandedPaths) {
    void loadChildren(path);
  }
}

export function toggleMarkdownOnly(): void {
  toggleFileTreeShowMarkdownOnly();
}

// Reload a single directory, keeping its cached listing visible until the
// fresh result arrives, so a save does not blank the folder for a frame.
async function refreshPath(path: string): Promise<void> {
  fileTreeStore.dirMtimes.delete(path);
  await loadChildren(path, true);
  treeRevision.value++;
}

/**
 * Decide whether a directory needs re-listing when it is shown again (e.g.
 * re-expanded after being collapsed). When the directory mtime is available it
 * is compared against the last seen value (a cheap stat skips unchanged
 * directories). When it is unavailable, fall back to the freshness threshold
 * to avoid re-listing on every expand.
 */
async function directoryNeedsRefresh(path: string): Promise<boolean> {
  const current = await getDirectoryMtime(path);
  if (current === null) {
    const last = fileTreeStore.lastLoaded.get(path) ?? 0;
    return Date.now() - last > STALE_REFRESH_MS;
  }
  const cached = fileTreeStore.dirMtimes.get(path);
  if (cached === undefined) {
    fileTreeStore.dirMtimes.set(path, current);
    const last = fileTreeStore.lastLoaded.get(path) ?? 0;
    return Date.now() - last > STALE_REFRESH_MS;
  }
  fileTreeStore.dirMtimes.set(path, current);
  return cached !== current;
}

// Prefix that a path must share to be inside `root`. The filesystem root
// already ends with "/", so appending another one ("//") would make every
// child path fail the startsWith check.
function childPrefix(root: string): string {
  return root.endsWith("/") ? root : `${root}/`;
}

// Refresh a directory only when it belongs to the visible tree; no-ops for
// paths outside the root or when the panel is hidden.
export function refreshDirectoryIfInTree(dir: string): void {
  if (!fileTreeStore.root) return;
  if (!settingsState.fileTreeVisible) return;
  if (dir !== fileTreeStore.root && !dir.startsWith(childPrefix(fileTreeStore.root))) return;
  void refreshPath(dir);
}

// Hook called after a file is written so the tree reflects new/renamed files
// and size changes without waiting for the next poll.
export function notifyFileSaved(path: string): void {
  refreshDirectoryIfInTree(dirname(path));
}

export function collapseAll(): void {
  fileTreeStore.expanded.clear();
  if (fileTreeStore.root) {
    fileTreeStore.expanded.set(fileTreeStore.root, true);
  }
}

/**
 * Drop a directory subtree from the cached tree after it was renamed or
 * deleted, and move a root that lived inside it up to its surviving parent.
 * Without this the tree keeps expansion state for paths that no longer exist.
 */
export function forgetSubtree(path: string): void {
  const prefix = `${path}/`;
  for (const key of [...fileTreeStore.expanded.keys()]) {
    if (key === path || key.startsWith(prefix)) fileTreeStore.expanded.delete(key);
  }
  for (const key of [...fileTreeStore.children.keys()]) {
    if (key === path || key.startsWith(prefix)) fileTreeStore.children.delete(key);
  }
  forgetLoadState(path, prefix);
  if (fileTreeStore.root === path || fileTreeStore.root.startsWith(prefix)) {
    setRoot(dirname(path));
  }
  treeRevision.value++;
}

// Drop the load bookkeeping for a directory subtree and cancel any listing
// still in flight for it, so a late result cannot resurrect a deleted path.
function forgetLoadState(path: string, prefix: string): void {
  const inSubtree = (key: string) => key === path || key.startsWith(prefix);
  for (const key of [...loadGeneration.keys()]) {
    if (!inSubtree(key)) continue;
    loadGeneration.delete(key);
    fileTreeStore.loading.delete(key);
    inFlightLoads.delete(key);
  }
  for (const key of [...fileTreeStore.lastLoaded.keys()]) {
    if (inSubtree(key)) fileTreeStore.lastLoaded.delete(key);
  }
  for (const key of [...fileTreeStore.dirMtimes.keys()]) {
    if (inSubtree(key)) fileTreeStore.dirMtimes.delete(key);
  }
}

// Free the listings the whole-tree filter loaded once it is cleared. The rows
// it returned already carry their entries, and the plain tree renders only
// expanded folders, so these caches are dead weight until a folder is opened
// (which lists it again). Kept while a query is active so repeat searches are
// served from the cache.
export function pruneUnopenedListings(): void {
  for (const path of [...fileTreeStore.children.keys()]) {
    if (fileTreeStore.expanded.get(path) || fileTreeStore.loading.get(path)) continue;
    fileTreeStore.children.delete(path);
    fileTreeStore.lastLoaded.delete(path);
    fileTreeStore.dirMtimes.delete(path);
    loadGeneration.delete(path);
  }
}

const REFRESH_SPIN_MIN_MS = 400;

export async function refreshTree(): Promise<void> {
  fileTreeStore.refreshing = true;
  const startedAt = Date.now();
  const expandedPaths = [...fileTreeStore.expanded.keys()].filter((path) => fileTreeStore.expanded.get(path));
  try {
    // Re-list in place: clearing the cache first blanked the tree and reset
    // its scroll position on every window focus (the old rows are kept until
    // each fresh listing lands).
    await Promise.all(expandedPaths.map((path) => refreshPath(path)));
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < REFRESH_SPIN_MIN_MS) {
      await new Promise((r) => setTimeout(r, REFRESH_SPIN_MIN_MS - elapsed));
    }
    fileTreeStore.refreshing = false;
  }
}

function isMarkdownName(name: string): boolean {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return false;
  return MARKDOWN_EXTENSION_SET.has(name.slice(idx + 1).toLowerCase());
}

// The markdown-only rule is shared by the regular tree builder and the
// whole-tree search so the filtering semantics cannot drift between them.
// Directories are always shown; non-markdown files are pruned.
export function passesMarkdownOnly(entry: FileEntry, markdownOnly: boolean): boolean {
  if (!markdownOnly) return true;
  return entry.is_dir || isMarkdownName(entry.name);
}

export function canNavigateUp(): boolean {
  const current = fileTreeStore.root;
  return Boolean(current) && dirname(current) !== current;
}

export function navigateToParent(): void {
  const current = fileTreeStore.root;
  if (!current) return;
  const parent = dirname(current);
  if (parent === current) return;
  setRoot(parent);
}

export function navigateInto(path: string): void {
  if (!path || path === fileTreeStore.root) return;
  setRoot(path);
}

/**
 * Expand every collapsed ancestor of `target` (including the root) so its row
 * becomes visible, loading children as needed. Returns whether the target has
 * a row in the tree afterwards; false when it is outside the root or filtered
 * out by the markdown-only mode.
 */
export async function revealPath(target: string): Promise<boolean> {
  const root = fileTreeStore.root;
  if (!root) return false;
  const prefix = childPrefix(root);
  if (!target.startsWith(prefix)) return false;

  fileTreeStore.expanded.set(root, true);
  if (!fileTreeStore.children.has(root)) {
    await loadChildren(root);
  }

  const chain: string[] = [];
  let current = dirname(target);
  while (current !== root && current.startsWith(prefix)) {
    chain.unshift(current);
    current = dirname(current);
  }
  for (const dir of chain) {
    fileTreeStore.expanded.set(dir, true);
    if (fileTreeStore.children.has(dir)) {
      if (await directoryNeedsRefresh(dir)) {
        await refreshPath(dir);
      }
    } else {
      await loadChildren(dir);
    }
  }

  // The target is visible only when it exists in its parent's listing and is
  // not pruned by the markdown-only mode (mirrors the tree builder's rule).
  const parent = dirname(target);
  const listed = fileTreeStore.children.get(parent) ?? [];
  const entry = listed.find((e) => e.path === target);
  if (!entry) return false;
  return passesMarkdownOnly(entry, settingsState.fileTreeShowMarkdownOnly);
}
