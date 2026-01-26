<script lang="ts">
    import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
    import Submenu from '$lib/components/ui/Submenu.svelte';
    import { addTab } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { requestCloseTab, saveCurrentFile } from '$lib/utils/fileSystem';
    import { FilePlus, Files, Save } from 'lucide-svelte';

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
        let targets: typeof appContext.editor.tabs = [];

        if (mode === 'saved') targets = appContext.editor.tabs.filter((t) => !t.isDirty);
        else if (mode === 'unsaved') targets = appContext.editor.tabs.filter((t) => t.isDirty);
        else if (mode === 'unpinned') targets = appContext.editor.tabs.filter((t) => !t.isPinned);
        else if (mode === 'all') targets = appContext.editor.tabs;

        for (const t of targets.filter((t) => !t.isPinned || mode === 'all')) {
            await requestCloseTab(t.id, mode === 'all');
        }
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

    function handleNewTab() {
        const newTabId = addTab();
        appContext.app.activeTabId = newTabId;
        onClose();
    }
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide })}
        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="text-ui hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handleNewTab}>
                <FilePlus size={14} class="opacity-70" /><span>New Tab</span><span
                    class="text-ui-sm ml-auto opacity-50">Ctrl+N</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                disabled={!hasUnsavedTabs}
                onclick={handleSaveAll}>
                <Save size={14} class="opacity-70" /><span>Save All</span><span
                    class="text-ui-sm ml-auto opacity-50">Ctrl+Shift+S</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>
        </div>

        <Submenu
            show={activeSubmenu === 'close'}
            side={submenuSide}
            onOpen={() => (activeSubmenu = 'close')}
            onClose={() => {
                if (activeSubmenu === 'close') activeSubmenu = null;
            }}>
            {#snippet trigger()}
                <button
                    type="button"
                    class="text-ui hover-surface flex w-full items-center px-3 py-1.5 text-left">
                    <Files size={14} class="mr-2 opacity-70" />
                    <span>Close Many</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button
                type="button"
                class="text-ui hover-surface w-full px-3 py-1.5 text-left"
                disabled={!hasSavedTabs}
                onclick={() => handleCloseMany('saved')}>Close Saved</button>
            <button
                type="button"
                class="text-ui hover-surface w-full px-3 py-1.5 text-left"
                disabled={!hasUnsavedTabs}
                onclick={() => handleCloseMany('unsaved')}>Close Not Saved</button>
            {#if hasPinnedTabs}
                <button
                    type="button"
                    class="text-ui hover-surface w-full px-3 py-1.5 text-left"
                    disabled={!hasUnpinnedTabs}
                    onclick={() => handleCloseMany('unpinned')}>Close Unpinned</button>
            {/if}
            <button
                type="button"
                class="text-ui hover-surface w-full px-3 py-1.5 text-left"
                onclick={() => handleCloseMany('all')}>Close All</button>
        </Submenu>
    {/snippet}
</ContextMenu>

<style>
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
</style>
