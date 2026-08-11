import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/utils/fileIO', () => ({
  readTextFile: vi.fn(),
}));

import { readTextFile } from '$lib/utils/fileIO';
import { createNewFile } from './editorLifecycle';
import { editorStore } from './editorStoreCore.svelte';
import { settingsState } from './settingsState.svelte';

const mockedReadTextFile = vi.mocked(readTextFile);

describe('createNewFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.newFileTemplatePath = '';
    editorStore.tabs = [];
    editorStore.mruStack = [];
  });

  it('creates an empty tab when no template is configured', async () => {
    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe('');
    expect(mockedReadTextFile).not.toHaveBeenCalled();
  });

  it('uses the template file content when a template is configured', async () => {
    settingsState.newFileTemplatePath = '/templates/base.md';
    mockedReadTextFile.mockResolvedValue({
      content: '# Title\n\nBody text',
      encoding: 'UTF-8',
      has_bom: false,
    });

    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe('# Title\n\nBody text');
    expect(mockedReadTextFile).toHaveBeenCalledWith('/templates/base.md');
  });

  it('creates a blank tab if the template cannot be read', async () => {
    settingsState.newFileTemplatePath = '/templates/missing.md';
    mockedReadTextFile.mockRejectedValue(new Error('file not found'));

    const id = await createNewFile();

    const tab = editorStore.tabs.find((t) => t.id === id);
    expect(tab?.content).toBe('');
  });
});
