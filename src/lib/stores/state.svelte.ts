import { appState } from './appState.svelte';
import { bookmarkStore } from './bookmarkStore.svelte';
import { dialogStore } from './dialogStore.svelte';
import { editorMetrics } from './editorMetrics.svelte';
import { editorStore } from './editorStore.svelte';
import { interfaceStore } from './interfaceStore.svelte';
import { toastStore } from './toastStore.svelte';
import { tooltipStore } from './tooltipStore.svelte';

/**
 * Centralized State Tree
 * Groups all individual stores into a logical hierarchy for easier access and fewer imports.
 * Renamed to appContext to avoid conflict with Svelte 5 $state rune.
 */
export const appContext = {
    // Core Application State
    get app() { return appState; },

    // Editor State & Content
    get editor() { return editorStore; },
    get metrics() { return editorMetrics; },
    get bookmarks() { return bookmarkStore; },

    // UI Components State & Interface Signals
    get interface() { return interfaceStore; },
    ui: {
        get tooltip() { return tooltipStore; },
        get toast() { return toastStore; },
        get dialog() { return dialogStore; }
    }
};
