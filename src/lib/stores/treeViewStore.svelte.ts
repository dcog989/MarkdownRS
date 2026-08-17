import type { FileEntry } from '$lib/types/api';
import { fuzzyMatches } from '$lib/utils/fuzzyMatch';
import { basename, dirname } from '$lib/utils/path';
import { fileTreeStore, loadChildren, passesMarkdownOnly } from './fileTreeStore.svelte';
import { settingsState } from './settingsState.svelte';

export const treeViewStore = $state({
  // Whole-tree filter results, populated asynchronously by `applyFilter`.
  filterRows: [] as TreeRow[],
  filterLoading: false,
});

// Tracks the latest whole-tree filter generation so a slow search aborts as soon
// as the query, root, or a tree-affecting setting changes.
let filterGeneration = 0;

export type TreeRow = {
  entry: FileEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  isRoot: boolean;
  // Component-only row rendering the ".." parent navigation entry.
  isParent?: boolean;
};

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
    if (!passesMarkdownOnly(entry, showMarkdownOnly)) continue;
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
    treeViewStore.filterRows = [];
    treeViewStore.filterLoading = false;
    return;
  }

  treeViewStore.filterLoading = true;
  try {
    const rows = await searchTree(root, q, markdownOnly, generation);
    if (generation !== filterGeneration) return;
    treeViewStore.filterRows = rows;
  } finally {
    if (generation === filterGeneration) {
      treeViewStore.filterLoading = false;
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
      } else if (passesMarkdownOnly(child, markdownOnly)) {
        stack.push({ entry: child, depth: node.depth + 1 });
      }
    }
  }

  const matches = new Set<string>();
  for (const item of ordered) {
    if (item.entry.is_dir) continue;
    if (fuzzyMatches(query, item.entry.name)) matches.add(item.entry.path);
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
