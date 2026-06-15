import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  deleteLine,
  indentLess,
  indentMore,
  moveLineDown,
  moveLineUp,
  selectLine,
} from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { addBookmark } from '$lib/stores/bookmarkStore.svelte';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { toggleSelectionComment } from '$lib/utils/commentToggle';

export type CmHandler = (view: EditorView) => boolean;

export interface CmBindingDef {
  registryKey: string;
  handler: CmHandler;
  defaultCmKey: string;
}

export const cmHandlerMap: CmBindingDef[] = [
  {
    registryKey: 'editor.toggleComment',
    handler: (view) => toggleSelectionComment(view),
    defaultCmKey: 'Mod-/',
  },
  {
    registryKey: 'editor.duplicateLine',
    handler: (view) => copyLineDown(view),
    defaultCmKey: 'Mod-Shift-d',
  },
  {
    registryKey: 'editor.deleteLine',
    handler: (view) => deleteLine(view),
    defaultCmKey: 'Mod-Shift-k',
  },
  {
    registryKey: 'editor.moveLineUp',
    handler: (view) => moveLineUp(view),
    defaultCmKey: 'Alt-ArrowUp',
  },
  {
    registryKey: 'editor.moveLineDown',
    handler: (view) => moveLineDown(view),
    defaultCmKey: 'Alt-ArrowDown',
  },
  {
    registryKey: 'editor.copyLineUp',
    handler: (view) => copyLineUp(view),
    defaultCmKey: 'Shift-Alt-ArrowUp',
  },
  {
    registryKey: 'editor.addCursorAbove',
    handler: (view) => addCursorAbove(view),
    defaultCmKey: 'Mod-Alt-ArrowUp',
  },
  {
    registryKey: 'editor.addCursorBelow',
    handler: (view) => addCursorBelow(view),
    defaultCmKey: 'Mod-Alt-ArrowDown',
  },
  {
    registryKey: 'editor.selectLine',
    handler: (view) => selectLine(view),
    defaultCmKey: 'Mod-l',
  },
  {
    registryKey: 'editor.gotoMatchingBracket',
    handler: (view) => cursorMatchingBracket(view),
    defaultCmKey: 'Mod-Shift-\\',
  },
  {
    registryKey: 'editor.indent',
    handler: (view) => indentMore(view),
    defaultCmKey: 'Mod-]',
  },
  {
    registryKey: 'editor.outdent',
    handler: (view) => indentLess(view),
    defaultCmKey: 'Mod-[',
  },
  {
    registryKey: 'textop.bold',
    handler: () => {
      performTextTransform('bold');
      return true;
    },
    defaultCmKey: 'Mod-b',
  },
  {
    registryKey: 'textop.italic',
    handler: () => {
      performTextTransform('italic');
      return true;
    },
    defaultCmKey: 'Mod-i',
  },
  {
    registryKey: 'textop.insert-link',
    handler: () => {
      performTextTransform('insert-link');
      return true;
    },
    defaultCmKey: 'Mod-k',
  },
  {
    registryKey: 'file.addBookmark',
    handler: () => {
      const tab = appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId);
      if (tab?.path) {
        addBookmark(tab.path, tab.title).then(({ isNew }) => {
          if (isNew) showToast('success', `Added "${tab.title}" to bookmarks`);
          else showToast('info', `"${tab.title}" is already bookmarked`);
        });
      } else {
        showToast('warning', 'Save the file before bookmarking');
      }
      return true;
    },
    defaultCmKey: 'Mod-d',
  },
];
