import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/utils/backend', () => ({
  callBackend: vi.fn().mockResolvedValue(undefined),
}));

import { initTransientState } from '$lib/stores/editorCache';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { editorStore } from '$lib/stores/editorStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { persistSession } from './sessionSerialization';

const mockedCallBackend = vi.mocked(callBackend);

function makeTab(overrides: Partial<EditorTab>): EditorTab {
  return {
    id: 'tab-1',
    title: 'Test',
    originalTitle: 'Test',
    content: '',
    lastSavedHash: '',
    isDirty: false,
    path: null,
    sizeBytes: 0,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: 'LF',
    encoding: 'UTF-8',
    contentLoaded: true,
    ...overrides,
  };
}

describe('persistSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.tabs = [];
    editorStore.closedTabsHistory = [];
    editorStore.mruStack = [];
    editorStore.sessionDirty = true;
  });

  it('does not write the empty placeholder of a restored-but-unloaded tab', async () => {
    editorStore.tabs = [
      makeTab({
        id: 'restored-unsaved',
        title: 'test unsaved content',
        isDirty: true,
        content: '',
        contentLoaded: false,
      }),
    ];
    initTransientState('restored-unsaved', { contentChanged: true, isPersisted: true });

    await persistSession();

    const [command, payload] = mockedCallBackend.mock.calls[0] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(command).toBe('save_session');
    expect(payload.activeTabs[0].content).toBeNull();
  });

  it('writes content for a loaded dirty tab', async () => {
    editorStore.tabs = [
      makeTab({
        id: 'loaded-unsaved',
        title: 'test unsaved content',
        isDirty: true,
        content: '# test unsaved content\n\nblah blah blah\n',
        contentLoaded: true,
      }),
    ];
    initTransientState('loaded-unsaved', { contentChanged: true, isPersisted: true });

    await persistSession();

    const [, payload] = mockedCallBackend.mock.calls[0] as unknown as [
      string,
      { activeTabs: Array<{ content: string | null }> },
    ];
    expect(payload.activeTabs[0].content).toBe('# test unsaved content\n\nblah blah blah\n');
  });
});
