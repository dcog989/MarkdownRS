export const appState = $state({
  // The focused pane's tab. Every command and status read keeps using this.
  activeTabId: null as string | null,
  // Tabs shown side by side. paneTabs[activePane] always mirrors activeTabId;
  // paneTabs[1] === null means the split is closed.
  paneTabs: [null, null] as [string | null, string | null],
  activePane: 0 as 0 | 1,
  // Set while a background operation (save all / save a non-focused tab)
  // repoints activeTabId temporarily; the pane layout must not follow it.
  paneSyncSuspended: false,
  isTabSwitching: false,
  writerMode: false,
  osPlatform: "windows" as "windows" | "linux" | "macos",
});

export function toggleWriterMode() {
  appState.writerMode = !appState.writerMode;
}
