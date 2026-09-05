import { toggleAbout, toggleBookmarks, toggleCommandPalette, toggleShortcuts } from "$lib/stores/interfaceStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import type { Command } from "./types";

export const windowCommands: Command[] = [
  {
    id: "window.commandPalette",
    label: "Window: Command Palette",
    category: "Window",
    defaultKey: "ctrl+shift+p",
    global: true,
    handler: toggleCommandPalette,
  },
  {
    id: "window.bookmarks",
    label: "Window: Bookmarks",
    category: "Window",
    defaultKey: "ctrl+shift+b",
    global: true,
    handler: toggleBookmarks,
  },
  {
    id: "window.settings",
    label: "Window: Settings",
    category: "Window",
    defaultKey: "ctrl+,",
    global: true,
    handler: () => {
      appContext.interface.showSettings = true;
    },
  },
  {
    id: "window.shortcuts",
    label: "Window: Keyboard Shortcuts",
    category: "Window",
    defaultKey: "f1",
    global: true,
    handler: toggleShortcuts,
  },
  {
    id: "window.about",
    label: "Window: About",
    category: "Window",
    handler: toggleAbout,
  },
];
