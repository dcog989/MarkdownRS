import { beforeEach, describe, expect, it, vi } from "vitest";

// paneStore only needs createNewFile from the editor barrel; stub it so the
// test does not pull in the file/dialog modules behind the barrel.
vi.mock("$lib/stores/editorStore.svelte", () => ({ createNewFile: vi.fn() }));

import { appState } from "./appState.svelte";
import { editorStore } from "./editorStoreCore.svelte";
import type { EditorTab } from "./editorTypes";
import { clearPaneTab, settlePanesAfterClose, toggleSplitPane } from "./paneStore.svelte";

function tab(id: string): EditorTab {
  return {
    id,
    title: id,
    content: "",
    lastSavedHash: "",
    isDirty: false,
    path: null,
    sizeBytes: 0,
    wordCount: 0,
    lineCount: 1,
    widestColumn: 0,
    cursor: { anchor: 0, head: 0 },
    lineEnding: "LF",
    encoding: "UTF-8",
    hasBom: false,
  };
}

function openSplit(primary: string, secondary: string): void {
  appState.paneTabs[0] = primary;
  appState.paneTabs[1] = secondary;
}

describe("pane layout invariants", () => {
  beforeEach(() => {
    editorStore.tabs = [tab("a"), tab("b")];
    editorStore.mruStack = ["a", "b"];
    appState.activeTabId = "a";
    appState.paneTabs[0] = null;
    appState.paneTabs[1] = null;
    appState.activePane = 0;
    appState.paneSyncSuspended = false;
  });

  it("opens a split with the focused tab and the next tab from MRU", async () => {
    await toggleSplitPane();

    expect(appState.paneTabs).toEqual(["a", "b"]);
    expect(appState.activePane).toBe(0);
    expect(appState.activeTabId).toBe("a");
  });

  it("keeps the secondary tab as primary after the primary tab closes", () => {
    openSplit("a", "b");
    appState.activeTabId = "a";

    // The close flow: clear the slot, point active at the next MRU tab, settle.
    clearPaneTab("a");
    appState.activeTabId = "b";
    settlePanesAfterClose();

    expect(appState.paneTabs).toEqual(["b", null]);
    expect(appState.activePane).toBe(0);
    expect(appState.activeTabId).toBe("b");
  });

  it("falls back to the primary tab when the secondary tab closes", () => {
    openSplit("a", "b");
    appState.activePane = 1;
    appState.activeTabId = "b";

    clearPaneTab("b");
    appState.activeTabId = "a";
    settlePanesAfterClose();

    expect(appState.paneTabs).toEqual(["a", null]);
    expect(appState.activePane).toBe(0);
    expect(appState.activeTabId).toBe("a");
  });

  it("leaves the split intact when a tab outside the panes closes", () => {
    openSplit("a", "b");

    clearPaneTab("c");
    settlePanesAfterClose();

    expect(appState.paneTabs).toEqual(["a", "b"]);
    expect(appState.activePane).toBe(0);
  });
});
