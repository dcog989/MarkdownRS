import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '$lib/types/api';

vi.mock('$lib/commands/directory', () => ({
  listDirectory: vi.fn(),
}));

import { listDirectory } from '$lib/commands/directory';
import {
  collapseAll,
  fileTreeStore,
  isDirLoading,
  isExpanded,
  loadChildren,
  setRoot,
  toggle,
  toggleHiddenFiles,
} from './fileTreeStore.svelte';

const mockedListDirectory = vi.mocked(listDirectory);

function entry(name: string, isDir = false): FileEntry {
  return {
    name,
    path: `/root/${name}`,
    is_dir: isDir,
    is_symlink: false,
    size: isDir ? 0 : 10,
    modified: null,
  };
}

describe('fileTreeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileTreeStore.root = '';
    fileTreeStore.expanded.clear();
    fileTreeStore.children.clear();
    fileTreeStore.loading.clear();
    fileTreeStore.showHidden = false;
    mockedListDirectory.mockReset();
  });

  it('setRoot sets the root, expands it, and loads its children', async () => {
    mockedListDirectory.mockResolvedValue([entry('a.md')]);

    setRoot('/root');
    await vi.waitFor(() => expect(fileTreeStore.children.has('/root')).toBe(true));

    expect(fileTreeStore.root).toBe('/root');
    expect(isExpanded('/root')).toBe(true);
    expect(mockedListDirectory).toHaveBeenCalledWith('/root', false);
    expect(fileTreeStore.children.get('/root')).toEqual([entry('a.md')]);
  });

  it('loadChildren only fetches a directory once', async () => {
    mockedListDirectory.mockResolvedValue([entry('a.md')]);

    await loadChildren('/root');
    await loadChildren('/root');
    await loadChildren('/root');

    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
  });

  it('toggle expands a collapsed directory and lazy-loads its children', async () => {
    mockedListDirectory.mockResolvedValue([entry('sub', true), entry('b.md')]);

    await toggle('/root');
    expect(isExpanded('/root')).toBe(true);
    expect(fileTreeStore.children.get('/root')?.[0]?.name).toBe('sub');

    mockedListDirectory.mockResolvedValue([entry('c.md')]);
    await toggle('/root/sub');
    expect(isExpanded('/root/sub')).toBe(true);
    expect(mockedListDirectory).toHaveBeenCalledWith('/root/sub', false);
  });

  it('toggle collapses an expanded directory without refetching', async () => {
    mockedListDirectory.mockResolvedValue([entry('a.md')]);

    await toggle('/root');
    await toggle('/root');

    expect(isExpanded('/root')).toBe(false);
    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
  });

  it('keeps already-loaded children when collapsing then re-expanding', async () => {
    mockedListDirectory.mockResolvedValue([entry('a.md')]);

    await toggle('/root');
    await toggle('/root');
    await toggle('/root');

    expect(mockedListDirectory).toHaveBeenCalledTimes(1);
    expect(fileTreeStore.children.get('/root')).toEqual([entry('a.md')]);
  });

  it('toggleHiddenFiles flips the flag, clears cache, and reloads the root', async () => {
    mockedListDirectory.mockResolvedValue([entry('a.md')]);
    setRoot('/root');
    await vi.waitFor(() => expect(fileTreeStore.children.has('/root')).toBe(true));

    mockedListDirectory.mockResolvedValue([entry('.hidden', true), entry('a.md')]);
    toggleHiddenFiles();

    expect(fileTreeStore.showHidden).toBe(true);
    expect(fileTreeStore.children.has('/root')).toBe(false);
    expect(mockedListDirectory).toHaveBeenLastCalledWith('/root', true);
    await vi.waitFor(() => expect(fileTreeStore.children.get('/root')?.length).toBe(2));
  });

  it('collapses every directory except the root', async () => {
    mockedListDirectory.mockResolvedValue([entry('sub', true)]);
    setRoot('/root');
    await vi.waitFor(() => expect(fileTreeStore.children.has('/root')).toBe(true));
    await toggle('/root/sub');

    collapseAll();

    expect(isExpanded('/root')).toBe(true);
    expect(isExpanded('/root/sub')).toBe(false);
  });

  it('isDirLoading tracks in-flight loads', async () => {
    let resolveLoad: (value: FileEntry[]) => void = () => {};
    mockedListDirectory.mockReturnValue(
      new Promise<FileEntry[]>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const pending = loadChildren('/root');
    expect(isDirLoading('/root')).toBe(true);

    resolveLoad([]);
    await pending;
    expect(isDirLoading('/root')).toBe(false);
  });

  it('handles a failed listing by storing an empty child list', async () => {
    mockedListDirectory.mockRejectedValue(new Error('permission denied'));

    await loadChildren('/root');

    expect(fileTreeStore.children.get('/root')).toEqual([]);
    expect(isDirLoading('/root')).toBe(false);
  });
});
