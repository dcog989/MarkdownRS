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
import { addBookmarkForActiveTab } from '$lib/stores/bookmarkStore.svelte';
import { performTextTransform } from '$lib/stores/editorStore.svelte';
import { toggleSelectionComment } from '$lib/utils/commentToggle';

export type CmHandler = (view: EditorView) => boolean;

export interface CmBindingDef {
  registryKey: string;
  handler: CmHandler;
}

export const cmHandlerMap: CmBindingDef[] = [
  {
    registryKey: 'editor.toggleComment',
    handler: (view) => toggleSelectionComment(view),
  },
  {
    registryKey: 'editor.duplicateLine',
    handler: (view) => copyLineDown(view),
  },
  {
    registryKey: 'editor.deleteLine',
    handler: (view) => deleteLine(view),
  },
  {
    registryKey: 'editor.moveLineUp',
    handler: (view) => moveLineUp(view),
  },
  {
    registryKey: 'editor.moveLineDown',
    handler: (view) => moveLineDown(view),
  },
  {
    registryKey: 'editor.copyLineUp',
    handler: (view) => copyLineUp(view),
  },
  {
    registryKey: 'editor.addCursorAbove',
    handler: (view) => addCursorAbove(view),
  },
  {
    registryKey: 'editor.addCursorBelow',
    handler: (view) => addCursorBelow(view),
  },
  {
    registryKey: 'editor.selectLine',
    handler: (view) => selectLine(view),
  },
  {
    registryKey: 'editor.gotoMatchingBracket',
    handler: (view) => cursorMatchingBracket(view),
  },
  {
    registryKey: 'editor.indent',
    handler: (view) => indentMore(view),
  },
  {
    registryKey: 'editor.outdent',
    handler: (view) => indentLess(view),
  },
  {
    registryKey: 'textop.bold',
    handler: () => {
      performTextTransform('bold');
      return true;
    },
  },
  {
    registryKey: 'textop.italic',
    handler: () => {
      performTextTransform('italic');
      return true;
    },
  },
  {
    registryKey: 'textop.insert-link',
    handler: () => {
      performTextTransform('insert-link');
      return true;
    },
  },
  {
    registryKey: 'file.addBookmark',
    handler: () => addBookmarkForActiveTab(),
  },
];
