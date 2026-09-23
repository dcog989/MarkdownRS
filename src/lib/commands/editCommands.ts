import { appContext } from "$lib/stores/state.svelte";
import { dispatchGoToLine, dispatchRedo, dispatchUndo } from "$lib/utils/editorCommands";
import type { Command } from "./types";

export const editCommands: Command[] = [
  {
    id: "edit.undo",
    label: "Undo",
    labelKey: "command.undo",
    category: "commandCategory.edit",
    defaultKey: "ctrl+z",
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchUndo(appContext.app.activeTabId);
      }
    },
  },
  {
    id: "edit.redo",
    label: "Redo",
    labelKey: "command.redo",
    category: "commandCategory.edit",
    defaultKey: "ctrl+y",
    showInPalette: false,
    handler: () => {
      if (appContext.app.activeTabId) {
        dispatchRedo(appContext.app.activeTabId);
      }
    },
  },
  {
    id: "edit.gotoLine",
    label: "Go to Line",
    labelKey: "command.gotoLine",
    category: "commandCategory.editor",
    showInPalette: false,
    defaultKey: "ctrl+g",
    handler: () => {
      if (appContext.app.activeTabId) {
        return dispatchGoToLine(appContext.app.activeTabId);
      }
      return false;
    },
  },
];
