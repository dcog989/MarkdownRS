import { addBookmarkForActiveTab } from "$lib/stores/bookmarkStore.svelte";
import { createNewFile } from "$lib/stores/editorStore.svelte";
import { toggleFileHistory } from "$lib/stores/interfaceStore.svelte";
import { appContext } from "$lib/stores/state.svelte";
import {
  openFile,
  requestCloseTab,
  saveAllFiles,
  saveCurrentFile,
  saveCurrentFileAs,
  triggerReopenClosedTab,
} from "$lib/utils/fileSystem";
import type { Command } from "./types";

export const fileCommands: Command[] = [
  {
    id: "file.new",
    label: "New File",
    labelKey: "command.newFile",
    category: "commandCategory.file",
    defaultKey: "ctrl+n",
    global: true,
    handler: async () => {
      const id = await createNewFile();
      appContext.app.activeTabId = id;
    },
  },
  {
    id: "file.open",
    label: "Open File",
    labelKey: "command.openFile",
    category: "commandCategory.file",
    defaultKey: "ctrl+o",
    global: true,
    handler: () => openFile(),
  },
  {
    id: "file.save",
    label: "Save",
    labelKey: "command.save",
    category: "commandCategory.file",
    defaultKey: "ctrl+s",
    global: true,
    handler: () => saveCurrentFile(),
  },
  {
    id: "file.saveAs",
    label: "Save As...",
    labelKey: "command.saveAs",
    category: "commandCategory.file",
    defaultKey: "ctrl+shift+s",
    global: true,
    handler: saveCurrentFileAs,
  },
  {
    id: "file.saveAll",
    label: "Save All",
    labelKey: "command.saveAll",
    category: "commandCategory.file",
    defaultKey: "ctrl+alt+s",
    global: true,
    handler: () => saveAllFiles(),
  },
  {
    id: "file.closeTab",
    label: "Close Tab",
    labelKey: "command.closeTab",
    category: "commandCategory.file",
    defaultKey: "ctrl+w",
    global: true,
    handler: () => {
      if (appContext.app.activeTabId) {
        requestCloseTab(appContext.app.activeTabId);
      }
    },
  },
  {
    id: "file.reopenClosedTab",
    label: "Reopen Last Closed Tab",
    labelKey: "command.reopenClosedTab",
    category: "commandCategory.file",
    defaultKey: "ctrl+shift+t",
    global: true,
    handler: () => triggerReopenClosedTab(0),
  },
  {
    id: "file.addBookmark",
    label: "Add to Bookmarks",
    labelKey: "command.addBookmark",
    category: "commandCategory.file",
    defaultKey: "ctrl+d",
    handler: () => addBookmarkForActiveTab(),
  },
  {
    id: "file.fileHistory",
    label: "File History...",
    labelKey: "command.fileHistory",
    category: "commandCategory.file",
    defaultKey: "ctrl+p",
    global: true,
    handler: toggleFileHistory,
  },
];
