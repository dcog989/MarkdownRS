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
import { openFind, openReplace } from "$lib/stores/interfaceStore.svelte";
import { isSelectionCommented, toggleSelectionComment } from "$lib/utils/commentToggle";
import { getActiveEditorView } from "$lib/utils/editorCommands";
import { runEditorCommand } from "./helpers";
import type { Command } from "./types";

export const editorCommands: Command[] = [
  {
    id: "editor.toggleComment",
    labelKey: () => {
      const view = getActiveEditorView();
      return view && isSelectionCommented(view) ? "command.uncommentLine" : "command.commentLine";
    },
    category: "commandCategory.editor",
    defaultKey: "ctrl+/",
    handler: () => runEditorCommand(toggleSelectionComment),
  },
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
  {
    id: "editor.duplicateLine",
    labelKey: "command.duplicateLine",
    category: "commandCategory.editor",
    defaultKey: "ctrl+shift+d",
    handler: () => runEditorCommand(copyLineDown),
  },
  {
    id: "editor.deleteLine",
    labelKey: "command.deleteLine",
    category: "commandCategory.editor",
    defaultKey: "ctrl+shift+k",
    handler: () => runEditorCommand(deleteLine),
  },
  {
    id: "editor.moveLineUp",
    labelKey: "command.moveLineUp",
    category: "commandCategory.editor",
    defaultKey: "alt+arrowup",
    handler: () => runEditorCommand(moveLineUp),
  },
  {
    id: "editor.moveLineDown",
    labelKey: "command.moveLineDown",
    category: "commandCategory.editor",
    defaultKey: "alt+arrowdown",
    handler: () => runEditorCommand(moveLineDown),
  },
  {
    id: "editor.copyLineUp",
    labelKey: "command.copyLineUp",
    category: "commandCategory.editor",
    defaultKey: "shift+alt+arrowup",
    handler: () => runEditorCommand(copyLineUp),
  },
  {
    id: "editor.addCursorAbove",
    labelKey: "command.addCursorAbove",
    category: "commandCategory.editor",
    defaultKey: "ctrl+alt+arrowup",
    handler: () => runEditorCommand(addCursorAbove),
  },
  {
    id: "editor.addCursorBelow",
    labelKey: "command.addCursorBelow",
    category: "commandCategory.editor",
    defaultKey: "ctrl+alt+arrowdown",
    handler: () => runEditorCommand(addCursorBelow),
  },
  {
    id: "editor.selectLine",
    labelKey: "command.selectLine",
    category: "commandCategory.editor",
    defaultKey: "ctrl+l",
    handler: () => runEditorCommand(selectLine),
  },
  {
    id: "editor.gotoMatchingBracket",
    labelKey: "command.gotoMatchingBracket",
    category: "commandCategory.editor",
    // Not ctrl+shift+\: Shift turns the key into "|", so it could never match.
    defaultKey: "ctrl+alt+b",
    handler: () => runEditorCommand(cursorMatchingBracket),
  },
  {
    id: "editor.indent",
    labelKey: "command.indent",
    category: "commandCategory.editor",
    defaultKey: "ctrl+]",
    handler: () => runEditorCommand(indentMore),
  },
  {
    id: "editor.outdent",
    labelKey: "command.outdent",
    category: "commandCategory.editor",
    defaultKey: "ctrl+[",
    handler: () => runEditorCommand(indentLess),
  },
];
