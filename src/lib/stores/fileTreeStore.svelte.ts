import { SvelteMap } from 'svelte/reactivity';
import { getDirectoryMtime, listDirectory } from '$lib/commands/directory';
import {
  settingsState,
  toggleFileTreeShowHidden,
  toggleFileTreeShowMarkdownOnly,
} from '$lib/stores/settingsState.svelte';
import type { FileEntry } from '$lib/types/api';
import { MARKDOWN_EXTENSIONS } from '$lib/utils/fileValidation';
import { fuzzyMatch } from '$lib/utils/fuzzyMatch';

export const fileTreeStore = $state({
  root: '',
  expanded: new SvelteMap<string, boolean>(),
  children: new SvelteMap<string, FileEntry[]>(),
  loading: new SvelteMap<string, boolean>(),
  refreshing: false,
  // Tracks when each directory's children were last fetched and the directory
  // mtime seen at that point, so the background poll can skip unchanged dirs.
  lastLoaded: new Map<string, number>(),
  dirMtimes: new Map<string, number>(),
  // Whole-tree filter results, populated asynchronously by `applyFilter`.
  filterRows: [] as TreeRow[],
  filterLoading: false,
});

// Directories are re-listed lazily on user interaction (expanding a folder,
// navigating, switching tabs, saving) rather than on a timer. When a directory
// mtime is unavailable this freshness threshold prevents re-listing on every
// expand, so a directory is only re-listed once per interval at most.
export const STALE_REFRESH_MS = 30_000;

// Tracks the latest in-flight listing generation per directory so stale results
// from an outdated request (e.g. after toggling hidden files) are discarded.
const loadGeneration = new Map<string, number>();

// Tracks the latest whole-tree filter generation so a slow search aborts as soon
// as the query, root, or a tree-affecting setting changes.
let filterGeneration = 0;

// In-flight listing promises, shared so callers awaiting an already-running
// load (e.g. revealPath right after a follow-mode root change) actually wait
// for it instead of returning immediately.
const inFlightLoads = new Map<string, Promise<void>>();

function invalidateLoads(): void {
  for (const path of loadGeneration.keys()) {
    loadGeneration.set(path, (loadGeneration.get(path) ?? 0) + 1);
  }
  fileTreeStore.dirMtimes.clear();
}

// Discard whole-tree filter results when the tree content or root changes so a
// stale search cannot linger on the wrong folder or stale directory listings.
function invalidateFilter(): void {
  filterGeneration++;
  fileTreeStore.filterRows = [];
  fileTreeStore.filterLoading = false;
}

export function setRoot(path: string): void {
  fileTreeStore.root = path;
  fileTreeStore.expanded.clear();
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  invalidateFilter();
  fileTreeStore.expanded.set(path, true);
  void loadChildren(path);
}

export function loadChildren(path: string): Promise<void> {
  if (fileTreeStore.loading.get(path)) {
    return inFlightLoads.get(path) ?? Promise.resolve();
  }
  if (fileTreeStore.children.has(path)) return Promise.resolve();

  const generation = (loadGeneration.get(path) ?? 0) + 1;
  loadGeneration.set(path, generation);
  fileTreeStore.loading.set(path, true);

  const promise = (async () => {
    try {
      const entries = await listDirectory(path, settingsState.fileTreeShowHidden);
      if (loadGeneration.get(path) !== generation) return;
      fileTreeStore.children.set(path, entries);
      fileTreeStore.lastLoaded.set(path, Date.now());
    } catch {
      if (loadGeneration.get(path) !== generation) return;
      fileTreeStore.children.set(path, []);
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
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  invalidateFilter();
  if (fileTreeStore.root) {
    void loadChildren(fileTreeStore.root);
  }
}

export function toggleMarkdownOnly(): void {
  toggleFileTreeShowMarkdownOnly();
}

// Reload a single directory, dropping its cached listing and mtime so a fresh
// result is fetched and the poll does not reload it again as "changed".
async function refreshPath(path: string): Promise<void> {
  fileTreeStore.dirMtimes.delete(path);
  fileTreeStore.children.delete(path);
  fileTreeStore.loading.delete(path);
  await loadChildren(path);
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

// Refresh a directory only when it belongs to the visible tree; no-ops for
// paths outside the root or when the panel is hidden.
export function refreshDirectoryIfInTree(dir: string): void {
  if (!fileTreeStore.root) return;
  if (!settingsState.fileTreeVisible) return;
  if (dir !== fileTreeStore.root && !dir.startsWith(`${fileTreeStore.root}/`)) return;
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

const REFRESH_SPIN_MIN_MS = 400;

export async function refreshTree(): Promise<void> {
  fileTreeStore.refreshing = true;
  const startedAt = Date.now();
  const expandedPaths = [...fileTreeStore.expanded.keys()].filter((path) => fileTreeStore.expanded.get(path));
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  invalidateFilter();
  try {
    await Promise.all(expandedPaths.map((path) => loadChildren(path)));
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < REFRESH_SPIN_MIN_MS) {
      await new Promise((r) => setTimeout(r, REFRESH_SPIN_MIN_MS - elapsed));
    }
    fileTreeStore.refreshing = false;
  }
}

export function dirname(path: string): string {
  if (path === '/' || path === '') return path;
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return '/';
  return path.slice(0, idx);
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

export type TreeRow = {
  entry: FileEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  isRoot: boolean;
  // Component-only row rendering the ".." parent navigation entry.
  isParent?: boolean;
};

const MARKDOWN_EXTENSION_SET = new Set(MARKDOWN_EXTENSIONS.map((ext) => ext.toLowerCase()));

function isMarkdownName(name: string): boolean {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return false;
  return MARKDOWN_EXTENSION_SET.has(name.slice(idx + 1).toLowerCase());
}

function rootEntry(root: string): FileEntry {
  return {
    name: basename(root) || root,
    path: root,
    is_dir: true,
    is_symlink: false,
    size: 0,
    modified: null,
  };
}

export function computeTreeRows(): TreeRow[] {
  const { root, expanded, children, loading } = fileTreeStore;
  const showMarkdownOnly = settingsState.fileTreeShowMarkdownOnly;
  const rows: TreeRow[] = [];
  if (!root) return rows;

  // Directory symlinks can point at an ancestor; without a visited set the
  // depth-first expansion below would loop forever. Render each path once.
  const visited = new Set<string>();
  visited.add(root);

  rows.push({
    entry: rootEntry(root),
    depth: 0,
    expanded: expanded.get(root) ?? false,
    loading: loading.get(root) ?? false,
    isRoot: true,
  });

  if (!(expanded.get(root) ?? false)) return rows;

  type StackItem = { entry: FileEntry; depth: number };
  const stack: StackItem[] = [];
  const rootChildren = children.get(root) ?? [];
  for (let i = rootChildren.length - 1; i >= 0; i--) {
    stack.push({ entry: rootChildren[i], depth: 1 });
  }

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    const { entry, depth } = item;
    if (visited.has(entry.path)) continue;
    if (showMarkdownOnly && !entry.is_dir && !isMarkdownName(entry.name)) continue;
    visited.add(entry.path);
    const isDir = entry.is_dir;
    const isOpen = isDir && (expanded.get(entry.path) ?? false);
    rows.push({
      entry,
      depth,
      expanded: isOpen,
      loading: isDir ? (loading.get(entry.path) ?? false) : false,
      isRoot: false,
    });
    if (isOpen) {
      const kids = children.get(entry.path) ?? [];
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ entry: kids[i], depth: depth + 1 });
      }
    }
  }
  return rows;
}

/**
 * Search the whole tree under the current root for files whose name
 * fuzzy-matches `query`, listing directories on demand so matches inside
 * collapsed or never-opened folders are found too. The returned rows keep the
 * root and every folder leading to a match so each match is shown within its
 * containing folder; non-matching files and branches are pruned.
 * Folder names never match — only file names do.
 */
export async function applyFilter(query: string, markdownOnly: boolean): Promise<void> {
  const generation = ++filterGeneration;
  const q = query.trim();
  const root = fileTreeStore.root;
  if (!q || !root) {
    fileTreeStore.filterRows = [];
    fileTreeStore.filterLoading = false;
    return;
  }

  fileTreeStore.filterLoading = true;
  try {
    const rows = await searchTree(root, q, markdownOnly, generation);
    if (generation !== filterGeneration) return;
    fileTreeStore.filterRows = rows;
  } finally {
    if (generation === filterGeneration) {
      fileTreeStore.filterLoading = false;
    }
  }
}

type WalkNode = { entry: FileEntry; depth: number };

async function searchTree(root: string, query: string, markdownOnly: boolean, generation: number): Promise<TreeRow[]> {
  const visited = new Set<string>([root]);
  const ordered: WalkNode[] = [];
  const stack: WalkNode[] = [{ entry: rootEntry(root), depth: 0 }];

  while (stack.length > 0) {
    if (generation !== filterGeneration) return [];
    const node = stack.pop();
    if (!node) break;
    ordered.push(node);
    if (!node.entry.is_dir) continue;

    if (!fileTreeStore.children.has(node.entry.path)) {
      await loadChildren(node.entry.path);
      if (generation !== filterGeneration) return [];
      if (!fileTreeStore.children.has(node.entry.path)) continue;
    }
    const kids = fileTreeStore.children.get(node.entry.path) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) {
      const child = kids[i];
      if (visited.has(child.path)) continue;
      visited.add(child.path);
      if (child.is_dir) {
        stack.push({ entry: child, depth: node.depth + 1 });
      } else if (!(markdownOnly && !isMarkdownName(child.name))) {
        stack.push({ entry: child, depth: node.depth + 1 });
      }
    }
  }

  const matches = new Set<string>();
  for (const item of ordered) {
    if (item.entry.is_dir) continue;
    if (fuzzyMatch(query, item.entry.name) !== null) matches.add(item.entry.path);
  }
  if (matches.size === 0) return [];

  const visible = new Set<string>([root]);
  for (const path of matches) {
    for (let parent = dirname(path); parent && parent !== root; parent = dirname(parent)) {
      visible.add(parent);
    }
  }

  const rows: TreeRow[] = [];
  for (const item of ordered) {
    if (item.entry.is_dir) {
      if (!visible.has(item.entry.path)) continue;
    } else if (!matches.has(item.entry.path)) {
      continue;
    }
    rows.push({
      entry: item.entry,
      depth: item.depth,
      expanded: false,
      loading: false,
      isRoot: item.entry.path === root,
    });
  }
  return rows;
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
  if (!root || !target.startsWith(`${root}/`)) return false;

  fileTreeStore.expanded.set(root, true);
  if (!fileTreeStore.children.has(root)) {
    await loadChildren(root);
  }

  const chain: string[] = [];
  let current = dirname(target);
  while (current !== root && current.startsWith(`${root}/`)) {
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

  return computeTreeRows().some((row) => row.entry.path === target);
}
