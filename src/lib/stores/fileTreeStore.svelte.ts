import { SvelteMap } from 'svelte/reactivity';
import { listDirectory } from '$lib/commands/directory';
import {
  settingsState,
  toggleFileTreeShowHidden,
  toggleFileTreeShowMarkdownOnly,
} from '$lib/stores/settingsState.svelte';
import type { FileEntry } from '$lib/types/api';
import { MARKDOWN_EXTENSIONS } from '$lib/utils/fileValidation';

export const fileTreeStore = $state({
  root: '',
  expanded: new SvelteMap<string, boolean>(),
  children: new SvelteMap<string, FileEntry[]>(),
  loading: new SvelteMap<string, boolean>(),
  refreshing: false,
});

// Tracks the latest in-flight listing generation per directory so stale results
// from an outdated request (e.g. after toggling hidden files) are discarded.
const loadGeneration = new Map<string, number>();

function invalidateLoads(): void {
  for (const path of loadGeneration.keys()) {
    loadGeneration.set(path, (loadGeneration.get(path) ?? 0) + 1);
  }
}

export function setRoot(path: string): void {
  fileTreeStore.root = path;
  fileTreeStore.expanded.clear();
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  fileTreeStore.expanded.set(path, true);
  void loadChildren(path);
}

export async function loadChildren(path: string): Promise<void> {
  if (fileTreeStore.loading.get(path)) return;
  if (fileTreeStore.children.has(path)) return;
  const generation = (loadGeneration.get(path) ?? 0) + 1;
  loadGeneration.set(path, generation);
  fileTreeStore.loading.set(path, true);
  try {
    const entries = await listDirectory(path, settingsState.fileTreeShowHidden);
    if (loadGeneration.get(path) !== generation) return;
    fileTreeStore.children.set(path, entries);
  } catch {
    if (loadGeneration.get(path) !== generation) return;
    fileTreeStore.children.set(path, []);
  } finally {
    if (loadGeneration.get(path) === generation) {
      fileTreeStore.loading.set(path, false);
    }
  }
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
  await loadChildren(path);
}

export function toggleHiddenFiles(): void {
  toggleFileTreeShowHidden();
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  invalidateLoads();
  if (fileTreeStore.root) {
    void loadChildren(fileTreeStore.root);
  }
}

export function toggleMarkdownOnly(): void {
  toggleFileTreeShowMarkdownOnly();
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
};

const MARKDOWN_EXTENSION_SET = new Set(MARKDOWN_EXTENSIONS.map((ext) => ext.toLowerCase()));

function isMarkdownName(name: string): boolean {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return false;
  return MARKDOWN_EXTENSION_SET.has(name.slice(idx + 1).toLowerCase());
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
    entry: {
      name: basename(root) || root,
      path: root,
      is_dir: true,
      is_symlink: false,
      size: 0,
      modified: null,
    },
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
