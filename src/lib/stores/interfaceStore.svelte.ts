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
    showCommandPalette: false,
    showTransform: false,

    // Editor Panels
    showFind: false,
    isReplaceMode: false,

    // Signals
    scrollToTabSignal: 0
});

// Actions
export function triggerScrollToTab() {
    interfaceStore.scrollToTabSignal++;
}

export function openFind() {
    interfaceStore.isReplaceMode = false;
    interfaceStore.showFind = true;
}

export function openReplace() {
    interfaceStore.isReplaceMode = true;
    interfaceStore.showFind = true;
}

export function closeFind() {
    interfaceStore.showFind = false;
}

export function toggleSettings() { interfaceStore.showSettings = !interfaceStore.showSettings; }
export function toggleShortcuts() { interfaceStore.showShortcuts = !interfaceStore.showShortcuts; }
export function toggleBookmarks() { interfaceStore.showBookmarks = !interfaceStore.showBookmarks; }
export function toggleCommandPalette() { interfaceStore.showCommandPalette = !interfaceStore.showCommandPalette; }
export function toggleTransform() { interfaceStore.showTransform = !interfaceStore.showTransform; }
export function toggleAbout() { interfaceStore.showAbout = !interfaceStore.showAbout; }
