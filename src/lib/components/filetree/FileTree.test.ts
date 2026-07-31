import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listDirectory } from '$lib/commands/directory';
import { fileTreeStore } from '$lib/stores/fileTreeStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import type { FileEntry } from '$lib/types/api';
import { openFile } from '$lib/utils/fileSystem';
import { saveSettings } from '$lib/utils/settings';
import FileTree from './FileTree.svelte';

vi.mock('$lib/commands/directory', () => ({
  listDirectory: vi.fn(),
}));

vi.mock('$lib/utils/fileSystem', () => ({
  openFile: vi.fn(),
}));

vi.mock('$lib/utils/settings', () => ({
  saveSettings: vi.fn(),
}));

const mockedListDirectory = vi.mocked(listDirectory);
const mockedOpenFile = vi.mocked(openFile);

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

describe('FileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appContext.settings.fileTreeFollowDocument = false;
    fileTreeStore.root = '';
    fileTreeStore.expanded.clear();
    fileTreeStore.children.clear();
    fileTreeStore.loading.clear();
    fileTreeStore.showHidden = false;
    mockedListDirectory.mockReset();
  });

  it('shows a hint when no root is set', () => {
    render(FileTree);
    expect(screen.getByText('Open a file to browse its folder')).toBeTruthy();
  });

  it('renders the rows for the current root', async () => {
    fileTreeStore.root = '/root';
    fileTreeStore.expanded.set('/root', true);
    fileTreeStore.children.set('/root', [entry('a.md'), entry('sub', true)]);

    render(FileTree);

    expect(await screen.findByText('a.md')).toBeTruthy();
    expect(screen.getByText('sub')).toBeTruthy();
    expect(screen.getAllByText('root').length).toBeGreaterThan(0);
  });

  it('opens a file when a file row is clicked', async () => {
    fileTreeStore.root = '/root';
    fileTreeStore.expanded.set('/root', true);
    fileTreeStore.children.set('/root', [entry('a.md')]);

    render(FileTree);
    await fireEvent.click(await screen.findByText('a.md'));

    expect(mockedOpenFile).toHaveBeenCalledWith('/root/a.md');
  });

  it('expands a directory row on click and lazy-loads its children', async () => {
    mockedListDirectory.mockResolvedValue([entry('b.md')]);
    fileTreeStore.root = '/root';
    fileTreeStore.expanded.set('/root', true);
    fileTreeStore.children.set('/root', [entry('sub', true)]);

    render(FileTree);
    await fireEvent.click(await screen.findByText('sub'));

    expect(mockedListDirectory).toHaveBeenCalledWith('/root/sub', false);
    await waitFor(() => expect(fileTreeStore.expanded.get('/root/sub')).toBe(true));
    expect(await screen.findByText('b.md')).toBeTruthy();
  });

  it('navigates into a directory on double-click', async () => {
    mockedListDirectory.mockResolvedValue([]);
    fileTreeStore.root = '/root';
    fileTreeStore.expanded.set('/root', true);
    fileTreeStore.children.set('/root', [entry('sub', true)]);

    render(FileTree);
    await fireEvent.dblClick(await screen.findByText('sub'));

    expect(fileTreeStore.root).toBe('/root/sub');
  });

  it('persists the tree root when follow mode is off', async () => {
    appContext.settings.fileTreeFollowDocument = false;
    fileTreeStore.root = '/root';
    fileTreeStore.expanded.set('/root', true);
    fileTreeStore.children.set('/root', []);

    render(FileTree);

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
  });
});
