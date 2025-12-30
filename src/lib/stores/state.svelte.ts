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
 * Groups all individual state objects for easier access and fewer imports.
 * Logic is handled by functions exported from individual store files.
 */
export const appContext = {
    app: appState,
    editor: editorStore,
    metrics: editorMetrics,
    bookmarks: bookmarkStore,
    interface: interfaceStore,
    ui: {
        tooltip: tooltipStore,
        toast: toastStore,
        dialog: dialogStore
    }
};
