import { addBookmarkForActiveTab } from '$lib/stores/bookmarkStore.svelte';
import { addTab } from '$lib/stores/editorStore.svelte';
import { toggleRecentFiles } from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import {
  openFile,
  requestCloseTab,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
} from '$lib/utils/fileSystem';
import type { Command } from './types';

export const fileCommands: Command[] = [
  {
    id: 'file.new',
    label: 'File: New File',
    category: 'File',
    defaultKey: 'ctrl+n',
    handler: () => {
      const id = addTab();
      appContext.app.activeTabId = id;
    },
  },
  {
    id: 'file.open',
    label: 'File: Open File',
    category: 'File',
    defaultKey: 'ctrl+o',
    handler: () => openFile(),
  },
  {
    id: 'file.save',
    label: 'File: Save',
    category: 'File',
    defaultKey: 'ctrl+s',
    handler: () => saveCurrentFile(),
  },
  {
    id: 'file.saveAs',
    label: 'File: Save As...',
    category: 'File',
    defaultKey: 'ctrl+shift+s',
    handler: saveCurrentFileAs,
  },
  {
    id: 'file.closeTab',
    label: 'File: Close Tab',
    category: 'File',
    defaultKey: 'ctrl+w',
    handler: () => {
      if (appContext.app.activeTabId) {
        requestCloseTab(appContext.app.activeTabId);
      }
    },
  },
  {
    id: 'file.reopenClosedTab',
    label: 'File: Reopen Last Closed Tab',
    category: 'File',
    defaultKey: 'ctrl+shift+t',
    handler: () => triggerReopenClosedTab(0),
  },
  {
    id: 'file.addBookmark',
    label: 'File: Add to Bookmarks',
    category: 'File',
    defaultKey: 'ctrl+d',
    handler: () => addBookmarkForActiveTab(),
  },
  {
    id: 'file.recentFiles',
    label: 'File: Recent Files...',
    category: 'File',
    defaultKey: 'ctrl+p',
    handler: toggleRecentFiles,
  },
];
