import { pushToMru } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import type { Command } from './types';

function tabSwitch(index: number): Command {
  return {
    id: `nav.tab${index + 1}`,
    label: `Navigation: Go to Tab ${index + 1}`,
    category: 'Navigation',
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
    id: 'nav.nextTab',
    label: 'Navigation: Next Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+pagedown',
    global: true,
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (!appContext.app.activeTabId) return;
      const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
      if (currentIndex >= 0) {
        const nextIndex = (currentIndex + 1) % tabs.length;
        const id = tabs[nextIndex].id;
        appContext.app.activeTabId = id;
        pushToMru(id);
      }
    },
  },
  {
    id: 'nav.prevTab',
    label: 'Navigation: Previous Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+pageup',
    global: true,
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (!appContext.app.activeTabId) return;
      const currentIndex = tabs.findIndex((t) => t.id === appContext.app.activeTabId);
      if (currentIndex >= 0) {
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        const id = tabs[prevIndex].id;
        appContext.app.activeTabId = id;
        pushToMru(id);
      }
    },
  },
  ...Array.from({ length: 5 }, (_, i) => tabSwitch(i)),
  {
    id: 'nav.lastTab',
    label: 'Navigation: Go to Last Tab',
    category: 'Navigation',
    showInPalette: false,
    defaultKey: 'ctrl+9',
    handler: () => {
      const tabs = appContext.editor.tabs;
      if (tabs.length > 0) {
        appContext.app.activeTabId = tabs[tabs.length - 1].id;
      }
    },
  },
];
