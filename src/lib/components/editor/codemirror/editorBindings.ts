import { redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { commands } from "$lib/commands/commands";
import { EDITOR_COMMAND_DEFS } from "$lib/commands/editorCommands";
import { TEXT_OPERATIONS_REGISTRY } from "$lib/config/textOperationsRegistry";
import { addBookmarkForActiveTab } from "$lib/stores/bookmarkStore.svelte";
import { performTextTransform } from "$lib/stores/editorStore.svelte";
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

const editorViewBindings: CmBindingDef[] = EDITOR_COMMAND_DEFS.map((def) => ({
  registryKey: def.id,
  handler: def.run,
}));

const viewBindings: CmBindingDef[] = [
  ...editorViewBindings,
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
