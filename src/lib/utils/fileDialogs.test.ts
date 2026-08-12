import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeDisk = vi.hoisted(() => {
  const files = new Map<string, { content: string; mtime: string; size: number; encoding: string; has_bom: boolean }>();
  let mtimeCounter = 1000;
  const nextMtime = () => `20260812 / ${String(mtimeCounter++).padStart(6, '0')}`;
  return { files, nextMtime };
});

vi.mock('$lib/utils/backend', () => ({
  callBackend: vi.fn().mockImplementation(async (command: string, args: any) => {
    const path = args?.path as string;
    switch (command) {
      case 'get_file_metadata': {
        const f = fakeDisk.files.get(path);
        if (!f) throw new Error('No such file');
        return { created: f.mtime, modified: f.mtime, size: f.size };
      }
      case 'read_text_file': {
        const f = fakeDisk.files.get(path);
        if (!f) throw new Error('No such file');
        return { content: f.content, encoding: f.encoding, has_bom: f.has_bom };
      }
      case 'write_text_file': {
        const bytes = new TextEncoder().encode(args.content).length;
        fakeDisk.files.set(path, {
          content: args.content,
          mtime: fakeDisk.nextMtime(),
          size: bytes,
          encoding: args.encoding ?? 'UTF-8',
          has_bom: args.hasBom ?? false,
        });
        return { bytes_written: bytes, encoding: args.encoding ?? 'UTF-8', has_bom: args.hasBom ?? false };
      }
      default:
        return undefined;
    }
  }),
  callBackendSafe: vi.fn().mockImplementation(async (command: string, args: any) => {
    const path = args?.path as string;
    if (command === 'get_file_metadata') {
      const f = fakeDisk.files.get(path);
      if (!f) throw new Error('No such file');
      return { created: f.mtime, modified: f.mtime, size: f.size };
    }
    if (command === 'read_text_file') {
      const f = fakeDisk.files.get(path);
      if (!f) throw new Error('No such file');
      return { content: f.content, encoding: f.encoding, has_bom: f.has_bom };
    }
    return undefined;
  }),
}));

vi.mock('$lib/services/fileWatcher', () => ({
  fileWatcher: {
    watch: vi.fn().mockResolvedValue(undefined),
    unwatch: vi.fn(),
    renew: vi.fn().mockResolvedValue(undefined),
    setWriteLock: vi.fn(),
  },
}));

vi.mock('$lib/utils/formatterRust', () => ({
  formatMarkdown: vi.fn().mockImplementation(async (s: string) => s),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}));

import { dialogStore } from '$lib/stores/dialogStore.svelte';
import { editorStore } from '$lib/stores/editorStoreCore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { openFile, saveCurrentFile } from '$lib/utils/fileDialogs';

const SCRATCH = '/tmp/scratch.md';
const ORIGINAL = '# Scratch\n\nHello world\n';

describe('save overwrite guard', () => {
  beforeEach(() => {
    editorStore.tabs = [];
    editorStore.closedTabsHistory = [];
    editorStore.mruStack = [];
    appContext.app.activeTabId = null;
    appContext.settings.formatOnSave = false;
    dialogStore.isOpen = false;
    fakeDisk.files.clear();
    fakeDisk.files.set(SCRATCH, {
      content: ORIGINAL,
      mtime: fakeDisk.nextMtime(),
      size: new TextEncoder().encode(ORIGINAL).length,
      encoding: 'UTF-8',
      has_bom: false,
    });
  });

  it('does not warn when a clean tab is re-saved after an edit was undone', async () => {
    await openFile(SCRATCH);
    const tab = editorStore.tabs[0];
    appContext.app.activeTabId = tab.id;

    const { updateContent } = await import('$lib/stores/editorUpdates');
    updateContent(tab.id, '# Scratch\n\nEdited\n', 3);
    updateContent(tab.id, ORIGINAL, 3);

    expect(editorStore.tabs[0].isDirty).toBe(false);

    const ok = await saveCurrentFile();
    expect(ok).toBe(true);
    expect(dialogStore.isOpen).toBe(false);
  });

  it('still warns when an external edit changed the on-disk baseline of a dirty tab', async () => {
    await openFile(SCRATCH);
    const tab = editorStore.tabs[0];
    appContext.app.activeTabId = tab.id;

    const { updateContent } = await import('$lib/stores/editorUpdates');
    updateContent(tab.id, '# Scratch\n\nMy edit\n', 3);

    fakeDisk.files.get(SCRATCH)!.content = '# External edit\n';

    const resultPromise = saveCurrentFile();
    await vi.waitFor(() => expect(dialogStore.isOpen).toBe(true));
    const { resolveDialog } = await import('$lib/stores/dialogStore.svelte');
    resolveDialog('save');
    await expect(resultPromise).resolves.toBe(true);
  });

  it('does not warn for a clean re-save right after a successful save', async () => {
    await openFile(SCRATCH);
    const tab = editorStore.tabs[0];
    appContext.app.activeTabId = tab.id;

    expect(await saveCurrentFile()).toBe(true);
    expect(dialogStore.isOpen).toBe(false);

    expect(await saveCurrentFile()).toBe(true);
    expect(dialogStore.isOpen).toBe(false);
  });
});
