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
import { openFind, openReplace } from "$lib/stores/interfaceStore.svelte";
import { isSelectionCommented, toggleSelectionComment } from "$lib/utils/commentToggle";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { runEditorCommand } from "./helpers";
import type { Command } from "./types";

interface EditorCommandDef {
  id: string;
  labelKey: string | (() => string);
  defaultKey: string;
  run: (view: EditorView) => boolean;
}

// One row per editor command. The registry entry and the CodeMirror key binding are
// both generated from this table, so an id, key or handler exists in exactly one place.
export const EDITOR_COMMAND_DEFS: EditorCommandDef[] = [
  {
    id: "editor.toggleComment",
    labelKey: () => {
      const view = getActiveEditorView();
      return view && isSelectionCommented(view) ? "command.uncommentLine" : "command.commentLine";
    },
    defaultKey: "ctrl+/",
    run: toggleSelectionComment,
  },
  { id: "editor.duplicateLine", labelKey: "command.duplicateLine", defaultKey: "ctrl+shift+d", run: copyLineDown },
  { id: "editor.deleteLine", labelKey: "command.deleteLine", defaultKey: "ctrl+shift+k", run: deleteLine },
  { id: "editor.moveLineUp", labelKey: "command.moveLineUp", defaultKey: "alt+arrowup", run: moveLineUp },
  { id: "editor.moveLineDown", labelKey: "command.moveLineDown", defaultKey: "alt+arrowdown", run: moveLineDown },
  { id: "editor.copyLineUp", labelKey: "command.copyLineUp", defaultKey: "shift+alt+arrowup", run: copyLineUp },
  {
    id: "editor.addCursorAbove",
    labelKey: "command.addCursorAbove",
    defaultKey: "ctrl+alt+arrowup",
    run: addCursorAbove,
  },
  {
    id: "editor.addCursorBelow",
    labelKey: "command.addCursorBelow",
    defaultKey: "ctrl+alt+arrowdown",
    run: addCursorBelow,
  },
  { id: "editor.selectLine", labelKey: "command.selectLine", defaultKey: "ctrl+l", run: selectLine },
  {
    id: "editor.gotoMatchingBracket",
    labelKey: "command.gotoMatchingBracket",
    // Not ctrl+shift+\: Shift turns the key into "|", so it could never match.
    defaultKey: "ctrl+alt+b",
    run: cursorMatchingBracket,
  },
  { id: "editor.indent", labelKey: "command.indent", defaultKey: "ctrl+]", run: indentMore },
  { id: "editor.outdent", labelKey: "command.outdent", defaultKey: "ctrl+[", run: indentLess },
];

export const editorCommands: Command[] = [
  ...EDITOR_COMMAND_DEFS.map((def) => ({
    id: def.id,
    labelKey: def.labelKey,
    category: "commandCategory.editor",
    defaultKey: def.defaultKey,
    handler: () => runEditorCommand(def.run),
  })),
  {
    id: "editor.find",
    labelKey: "command.find",
    category: "commandCategory.editor",
    defaultKey: "ctrl+f",
    global: true,
    handler: openFind,
  },
  {
    id: "editor.replace",
    labelKey: "command.replace",
    category: "commandCategory.editor",
    defaultKey: "ctrl+h",
    global: true,
    handler: openReplace,
  },
];
