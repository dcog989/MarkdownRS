import { SvelteMap } from 'svelte/reactivity';
import { listDirectory } from '$lib/commands/directory';
import type { FileEntry } from '$lib/types/api';

export const fileTreeStore = $state({
  root: '',
  expanded: new SvelteMap<string, boolean>(),
  children: new SvelteMap<string, FileEntry[]>(),
  loading: new SvelteMap<string, boolean>(),
  showHidden: false,
});

export function setRoot(path: string): void {
  fileTreeStore.root = path;
  fileTreeStore.expanded.clear();
  fileTreeStore.children.clear();
  fileTreeStore.loading.clear();
  fileTreeStore.expanded.set(path, true);
  void loadChildren(path);
}

export async function loadChildren(path: string): Promise<void> {
  if (fileTreeStore.loading.get(path)) return;
  if (fileTreeStore.children.has(path)) return;
  fileTreeStore.loading.set(path, true);
  try {
    const entries = await listDirectory(path, fileTreeStore.showHidden);
    fileTreeStore.children.set(path, entries);
  } catch {
    fileTreeStore.children.set(path, []);
  } finally {
    fileTreeStore.loading.set(path, false);
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
  fileTreeStore.showHidden = !fileTreeStore.showHidden;
  fileTreeStore.children.clear();
  if (fileTreeStore.root) {
    void loadChildren(fileTreeStore.root);
  }
}

export function collapseAll(): void {
  fileTreeStore.expanded.clear();
  if (fileTreeStore.root) {
    fileTreeStore.expanded.set(fileTreeStore.root, true);
  }
}

export function dirname(path: string): string {
  if (path === '/' || path === '') return path;
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return '/';
  return path.slice(0, idx);
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
