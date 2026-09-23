import { pushToMru } from "$lib/stores/editorStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import type { Command } from "./types";

function cycleTab(direction: 1 | -1): void {
  const tabs = appContext.editor.tabs;
  if (!appContext.app.activeTabId) return;
  const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
  if (currentIndex < 0) return;
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  const id = tabs[nextIndex].id;
  appContext.app.activeTabId = id;
  pushToMru(id);
}

function tabSwitch(index: number): Command {
  return {
    id: `nav.tab${index + 1}`,
    label: `Go to Tab ${index + 1}`,
    category: "commandCategory.navigation",
    showInPalette: false,
    defaultKey: `ctrl+${index + 1}`,
    handler: () => {
      const tab = appContext.editor.tabs[index];
      if (tab) appContext.app.activeTabId = tab.id;
    },
  };
}

export const navigationCommands: Command[] = [
  {
    id: "nav.nextTab",
    label: "Next Tab",
    labelKey: "command.nextTab",
    category: "commandCategory.navigation",
    showInPalette: false,
    defaultKey: "ctrl+pagedown",
    global: true,
    handler: () => cycleTab(1),
  },
  {
    id: "nav.prevTab",
    label: "Previous Tab",
    labelKey: "command.previousTab",
    category: "commandCategory.navigation",
    showInPalette: false,
    defaultKey: "ctrl+pageup",
    global: true,
    handler: () => cycleTab(-1),
  },
  ...Array.from({ length: 5 }, (_, i) => tabSwitch(i)),
  {
    id: "nav.lastTab",
    label: "Go to Last Tab",
    labelKey: "command.lastTab",
    category: "commandCategory.navigation",
    showInPalette: false,
    defaultKey: "ctrl+9",
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (tabs.length > 0) {
        appContext.app.activeTabId = tabs[tabs.length - 1].id;
      }
    },
  },
];
