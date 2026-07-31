import { bench, describe } from 'vitest';
import type { FileEntry } from '$lib/types/api';
import { computeTreeRows, fileTreeStore } from './fileTreeStore.svelte';

function entry(path: string, isDir: boolean): FileEntry {
  const parts = path.split('/');
  return {
    name: parts[parts.length - 1] || path,
    path,
    is_dir: isDir,
    is_symlink: false,
    size: isDir ? 0 : 10,
    modified: null,
  };
}

function seedTree(dirsPerLevel: number, depth: number): void {
  const root = '/root';
  fileTreeStore.root = root;
  fileTreeStore.expanded.set(root, true);
  fileTreeStore.children.clear();

  let level = [root];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const dir of level) {
      const children: FileEntry[] = [];
      for (let i = 0; i < dirsPerLevel; i++) {
        const dirPath = `${dir}/d${d}-${i}`;
        const filePath = `${dir}/f${d}-${i}.md`;
        children.push(entry(dirPath, true));
        children.push(entry(filePath, false));
        next.push(dirPath);
      }
      fileTreeStore.children.set(dir, children);
      fileTreeStore.expanded.set(dir, true);
    }
    level = next;
  }
}

describe('computeTreeRows', () => {
  bench('wide tree (2 levels x 200 dirs)', () => {
    seedTree(200, 2);
    computeTreeRows();
  });

  bench('deep tree (4 levels x 10 dirs)', () => {
    seedTree(10, 4);
    computeTreeRows();
  });
});
