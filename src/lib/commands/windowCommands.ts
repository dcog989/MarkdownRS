import {
  toggleAbout,
  toggleBookmarks,
  toggleCommandPalette,
  toggleShortcuts,
  toggleTransform,
} from '$lib/stores/interfaceStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import type { Command } from './types';

export const windowCommands: Command[] = [
  {
    id: 'window.commandPalette',
    label: 'Window: Command Palette',
    category: 'Window',
    defaultKey: 'ctrl+shift+p',
    handler: toggleCommandPalette,
  },
  {
    id: 'window.bookmarks',
    label: 'Window: Bookmarks',
    category: 'Window',
    defaultKey: 'ctrl+shift+b',
    handler: toggleBookmarks,
  },
  {
    id: 'window.settings',
    label: 'Window: Settings',
    category: 'Window',
    defaultKey: 'ctrl+,',
    handler: () => {
      appContext.interface.showSettings = true;
    },
  },
  {
    id: 'window.shortcuts',
    label: 'Window: Keyboard Shortcuts',
    category: 'Window',
    defaultKey: 'f1',
    handler: toggleShortcuts,
  },
  {
    id: 'window.about',
    label: 'Window: About',
    category: 'Window',
    handler: toggleAbout,
  },
  {
    id: 'window.transform',
    label: 'Window: Text Transformations',
    category: 'Window',
    defaultKey: 'ctrl+t',
    handler: (e) => {
      e?.preventDefault();
      e?.stopImmediatePropagation();
      toggleTransform();
    },
  },
];
