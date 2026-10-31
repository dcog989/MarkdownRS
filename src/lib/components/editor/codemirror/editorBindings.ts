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
  redo,
  selectLine,
  undo,
} from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { commands } from "$lib/commands/commands";
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

const commandsById = new Map(commands.map((cmd) => [cmd.id, cmd]));

function runRegistryCommand(registryKey: string): CmHandler {
  return () => {
    void commandsById.get(registryKey)?.handler?.();
    return true;
  };
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

const viewBindings: CmBindingDef[] = [
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
    registryKey: "edit.undo",
    handler: (view) => undo(view),
  },
  {
    registryKey: "edit.redo",
    handler: (view) => redo(view),
  },
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

const viewCommandIds = new Set(viewBindings.map((binding) => binding.registryKey));

// Global commands are handled window-wide. Every other command needs a key path here
// because the window handler skips inputs and the editor is a contenteditable.
const appBindings: CmBindingDef[] = commands
  .filter((cmd) => !cmd.global && !viewCommandIds.has(cmd.id))
  .map((cmd) => ({ registryKey: cmd.id, handler: runRegistryCommand(cmd.id) }));

export const cmHandlerMap: CmBindingDef[] = [...viewBindings, ...appBindings];
