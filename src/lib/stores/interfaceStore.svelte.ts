/**
 * Global Interface State Store
 * Manages visibility of global UI elements (modals, panels) and cross-component signaling.
 */

export const interfaceStore = $state({
  // Global Modals
  showSettings: false,
  showShortcuts: false,
  showAbout: false,
  showBookmarks: false,
  showFileHistory: false,
  showCommandPalette: false,
  showData: false,

  // Editor Panels
  showFind: false,
  isReplaceMode: false,

  // Signals
  scrollToTabSignal: 0,
});

// Actions
export function triggerScrollToTab() {
  interfaceStore.scrollToTabSignal++;
}

export function openFind(): boolean {
  if (interfaceStore.showFind) {
    closeFind();
    return true;
  }
  interfaceStore.isReplaceMode = false;
  interfaceStore.showFind = true;
  return true;
}

export function openReplace(): boolean {
  interfaceStore.isReplaceMode = true;
  interfaceStore.showFind = true;
  return true;
}

export function closeFind() {
  interfaceStore.showFind = false;
}

export function toggleSettings() {
  interfaceStore.showSettings = !interfaceStore.showSettings;
}
export function toggleShortcuts() {
  interfaceStore.showShortcuts = !interfaceStore.showShortcuts;
}
export function toggleBookmarks() {
  interfaceStore.showBookmarks = !interfaceStore.showBookmarks;
}
export function toggleFileHistory() {
  interfaceStore.showFileHistory = !interfaceStore.showFileHistory;
}
export function toggleCommandPalette() {
  interfaceStore.showCommandPalette = !interfaceStore.showCommandPalette;
}
export function toggleAbout() {
  interfaceStore.showAbout = !interfaceStore.showAbout;
}

export function toggleData() {
  interfaceStore.showData = !interfaceStore.showData;
}
