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
} from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { TEXT_OPERATIONS_REGISTRY } from "$lib/config/textOperationsRegistry";
import { addBookmarkForActiveTab } from "$lib/stores/bookmarkStore.svelte";
import { performTextTransform } from "$lib/stores/editorStore.svelte";
import { toggleSelectionComment } from "$lib/utils/commentToggle";
import { promptGoToLine } from "$lib/utils/editorCommands";

export type CmHandler = (view: EditorView) => boolean;

export interface CmBindingDef {
  registryKey: string;
  handler: CmHandler;
}

const textOpBindings: CmBindingDef[] = Object.values(TEXT_OPERATIONS_REGISTRY)
  .filter((op) => op.defaultKey)
  .map((op) => ({
    registryKey: `textop.${op.id}`,
    handler: () => {
      performTextTransform(op.id);
      return true;
    },
  }));

export const cmHandlerMap: CmBindingDef[] = [
  {
    registryKey: "editor.toggleComment",
    handler: (view) => toggleSelectionComment(view),
  },
  {
    registryKey: "editor.duplicateLine",
    handler: (view) => copyLineDown(view),
  },
  {
    registryKey: "editor.deleteLine",
    handler: (view) => deleteLine(view),
  },
  {
    registryKey: "editor.moveLineUp",
    handler: (view) => moveLineUp(view),
  },
  {
    registryKey: "editor.moveLineDown",
    handler: (view) => moveLineDown(view),
  },
  {
    registryKey: "editor.copyLineUp",
    handler: (view) => copyLineUp(view),
  },
  {
    registryKey: "editor.addCursorAbove",
    handler: (view) => addCursorAbove(view),
  },
  {
    registryKey: "editor.addCursorBelow",
    handler: (view) => addCursorBelow(view),
  },
  {
    registryKey: "editor.selectLine",
    handler: (view) => selectLine(view),
  },
  {
    registryKey: "editor.gotoMatchingBracket",
    handler: (view) => cursorMatchingBracket(view),
  },
  {
    registryKey: "editor.indent",
    handler: (view) => indentMore(view),
  },
  {
    registryKey: "editor.outdent",
    handler: (view) => indentLess(view),
  },
  ...textOpBindings,
  {
    registryKey: "edit.gotoLine",
    handler: (view) => {
      void promptGoToLine(view);
      return true;
    },
  },
  {
    registryKey: "file.addBookmark",
    handler: () => addBookmarkForActiveTab(),
  },
];
