/**
 * Global Interface State Store
 * Manages visibility of global UI elements (modals, panels) and cross-component signaling.
 * Replaces ad-hoc window.dispatchEvent usage.
 */
class InterfaceStore {
    // Global Modals
    showSettings = $state(false);
    showShortcuts = $state(false);
    showAbout = $state(false);
    showBookmarks = $state(false);
    showCommandPalette = $state(false);
    showTransform = $state(false);

    // Editor Panels
    // We separate 'Find' and 'Replace' intentions, though they open the same panel
    showFind = $state(false);
    isReplaceMode = $state(false); // Controls the mode of the find panel

    // Signals (Counters used to trigger effects)
    scrollToTabSignal = $state(0);

    // Actions
    triggerScrollToTab() {
        this.scrollToTabSignal++;
    }

    openFind() {
        this.isReplaceMode = false;
        this.showFind = true;
    }

    openReplace() {
        this.isReplaceMode = true;
        this.showFind = true;
    }

    closeFind() {
        this.showFind = false;
    }

    toggleSettings() { this.showSettings = !this.showSettings; }
    toggleShortcuts() { this.showShortcuts = !this.showShortcuts; }
    toggleBookmarks() { this.showBookmarks = !this.showBookmarks; }
    toggleCommandPalette() { this.showCommandPalette = !this.showCommandPalette; }
    toggleTransform() { this.showTransform = !this.showTransform; }
    toggleAbout() { this.showAbout = !this.showAbout; }
}

export const interfaceStore = new InterfaceStore();
