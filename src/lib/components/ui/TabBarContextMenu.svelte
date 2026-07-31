<script lang="ts">
import { FilePlus, Files, Save } from 'lucide-svelte';
import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
import Submenu from '$lib/components/ui/Submenu.svelte';
import { createNewFile } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { closeManyTabs, saveCurrentFile } from '$lib/utils/fileSystem';

let { x, y, onClose } = $props<{
    x: number;
    y: number;
    onClose: () => void;
}>();

let activeSubmenu = $state<'close' | null>(null);

let hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty));
let hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty));
let hasPinnedTabs = $derived(appContext.editor.tabs.some((t) => t.isPinned));
let hasUnpinnedTabs = $derived(appContext.editor.tabs.some((t) => !t.isPinned));

async function handleCloseMany(mode: 'saved' | 'unsaved' | 'all' | 'unpinned') {
    await closeManyTabs(mode);
    onClose();
}

async function handleSaveAll() {
    const dirtyTabs = appContext.editor.tabs.filter((t) => t.isDirty && t.path);
    const previousActiveId = appContext.app.activeTabId;

    for (const tab of dirtyTabs) {
        appContext.app.activeTabId = tab.id;
        await saveCurrentFile();
    }

    if (previousActiveId) {
        appContext.app.activeTabId = previousActiveId;
    }

    onClose();
}

async function handleNewTab() {
    const newTabId = await createNewFile();
    appContext.app.activeTabId = newTabId;
    onClose();
}
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide: _submenuSide })}
        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handleNewTab}>
                <FilePlus size={14} class="opacity-70" /><span>New Tab</span
                ><span class="text-ui-sm ml-auto opacity-50">Ctrl+N</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                disabled={!hasUnsavedTabs}
                onclick={handleSaveAll}>
                <Save size={14} class="opacity-70" /><span>Save All</span
                ><span class="text-ui-sm ml-auto opacity-50">Ctrl+Shift+S</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>
        </div>

        <Submenu
            show={activeSubmenu === 'close'}
            side={_submenuSide}
            onOpen={() => (activeSubmenu = 'close')}
            onClose={() => {
                if (activeSubmenu === 'close') activeSubmenu = null;
            }}>
            {#snippet trigger()}
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
                    <Files size={14} class="mr-2 opacity-70" />
                    <span>Close Many</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                disabled={!hasSavedTabs}
                onclick={() => handleCloseMany('saved')}>
                Close Saved
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                disabled={!hasUnsavedTabs}
                onclick={() => handleCloseMany('unsaved')}>
                Close Not Saved
            </button>
            {#if hasPinnedTabs}
                <button
                    type="button"
                    class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                    disabled={!hasUnpinnedTabs}
                    onclick={() => handleCloseMany('unpinned')}>
                    Close Unpinned
                </button>
            {/if}
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={() => handleCloseMany('all')}>
                Close All
            </button>
        </Submenu>
    {/snippet}
</ContextMenu>
