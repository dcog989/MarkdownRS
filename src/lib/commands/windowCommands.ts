import { toggleAbout, toggleBookmarks, toggleCommandPalette, toggleShortcuts } from "$lib/stores/interfaceStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import type { Command } from "./types";

export const windowCommands: Command[] = [
  {
    id: "window.commandPalette",
    label: "Command Palette",
    labelKey: "command.commandPalette",
    category: "commandCategory.window",
    defaultKey: "ctrl+shift+p",
    global: true,
    handler: toggleCommandPalette,
  },
  {
    id: "window.bookmarks",
    label: "Bookmarks",
    labelKey: "command.bookmarks",
    category: "commandCategory.window",
    defaultKey: "ctrl+shift+b",
    global: true,
    handler: toggleBookmarks,
  },
  {
    id: "window.settings",
    label: "Settings",
    labelKey: "command.settings",
    category: "commandCategory.window",
    defaultKey: "ctrl+,",
    global: true,
    handler: () => {
      appContext.interface.showSettings = true;
    },
  },
  {
    id: "window.shortcuts",
    label: "Keyboard Shortcuts",
    labelKey: "command.keyboardShortcuts",
    category: "commandCategory.window",
    defaultKey: "f1",
    global: true,
    handler: toggleShortcuts,
  },
  {
    id: "window.about",
    label: "About",
    labelKey: "command.about",
    category: "commandCategory.window",
    handler: toggleAbout,
  },
];
