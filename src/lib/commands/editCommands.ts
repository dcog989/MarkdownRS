import { appContext } from '$lib/stores/state.svelte';
import { dispatchGoToLine, dispatchRedo, dispatchUndo } from '$lib/utils/editorCommands';
import type { Command } from './types';

export const editCommands: Command[] = [
  {
    id: 'edit.undo',
    label: 'Edit: Undo',
    category: 'Edit',
    defaultKey: 'ctrl+z',
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchUndo(appContext.app.activeTabId);
      }
    },
  },
  {
    id: 'edit.redo',
    label: 'Edit: Redo',
    category: 'Edit',
    defaultKey: 'ctrl+y',
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchRedo(appContext.app.activeTabId);
      }
    },
  },
  {
    id: 'edit.gotoLine',
    label: 'Editor: Go to Line',
    category: 'Editor',
    showInPalette: false,
    defaultKey: 'ctrl+g',
    handler: () => {
      if (appContext.app.activeTabId) {
        return dispatchGoToLine(appContext.app.activeTabId);
      }
      return false;
    },
  },
];
