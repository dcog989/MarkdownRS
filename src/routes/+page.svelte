<script lang="ts">
import { ChevronDown, ChevronRight } from 'lucide-svelte';
import { onDestroy } from 'svelte';
import { tooltip } from '$lib/actions/tooltip';
import AppLifecycle from '$lib/components/app/AppLifecycle.svelte';
import Editor from '$lib/components/editor/Editor.svelte';
import { createSplitResize } from '$lib/components/editor/logic/splitResize.svelte';
import FileTree from '$lib/components/filetree/FileTree.svelte';
import Preview from '$lib/components/preview/Preview.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import StatusBar from '$lib/components/ui/StatusBar.svelte';
import TabBar from '$lib/components/ui/TabBar.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { pushToMru } from '$lib/stores/editorStore.svelte';
import { toggleFileTree } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';

const splitResize = createSplitResize();

let mainContainer = $state<HTMLDivElement>();

function handleToggleFileTree() {
    toggleFileTree();
    saveSettings();
}

let activeTab = $derived(
    appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId),
);

let isMarkdown = $derived.by(() => {
    if (!activeTab) return true;
    if (activeTab.path) return isMarkdownFile(activeTab.path);
    return activeTab.preferredExtension !== 'txt';
});

let showPreview = $derived(appContext.settings.splitView && isMarkdown);
let showWriterTabDropdown = $state(false);

onDestroy(() => {
    splitResize.cleanup();
});

function onResizeMouseDown(e: MouseEvent) {
    if (mainContainer) splitResize.registerContainer(mainContainer);
    splitResize.startResize(e);
}
</script>

<AppLifecycle>
    <div
        class="app-shell bg-bg-main text-fg-default flex h-screen w-screen flex-col overflow-hidden">
        {#if !appContext.app.writerMode}
            <TabBar />
        {/if}

        <div
            class="relative z-0 flex flex-1 overflow-hidden outline-none"
            class:writer-mode={appContext.app.writerMode}
            bind:this={mainContainer}>
            {#if !appContext.app.writerMode}
                {#if appContext.settings.fileTreeVisible}
                    <FileTree onClose={handleToggleFileTree} />
                {:else}
                    <div class="ft-peek-edge group shrink-0">
                        <button
                            type="button"
                            aria-label="Show file tree"
                            class="ft-peek"
                            use:tooltip={'Show file tree'}
                            onclick={handleToggleFileTree}>
                            <ChevronRight
                                size={14}
                                class="text-fg-muted transition-colors group-hover:text-fg-default" />
                        </button>
                    </div>
                {/if}
            {/if}
            {#if appContext.app.writerMode}
                <div class="absolute top-2 left-0 pl-3 z-20">
                    <button
                        type="button"
                        class="bg-bg-panel border-border-light hover:bg-bg-hover text-fg-default flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-colors"
                        onclick={() => (showWriterTabDropdown = !showWriterTabDropdown)}>
                        <ChevronDown size={16} />
                        <span>{appContext.editor.tabs.length} tab{appContext.editor.tabs.length !== 1 ? 's' : ''}</span>
                    </button>
                    <TabDropdown
                        isOpen={showWriterTabDropdown}
                        onSelect={(id) => {
                            appContext.app.activeTabId = id;
                            pushToMru(id);
                            showWriterTabDropdown = false;
                        }}
                        onClose={() => (showWriterTabDropdown = false)} />
                </div>
            {/if}
            {#if appContext.app.activeTabId}
                    <div
                        class="flex h-full w-full"
                        class:flex-row={splitResize.isVertical}
                        class:flex-col={!splitResize.isVertical}>
                    <div
                        class="writer-content h-full overflow-hidden"
                        style:--writer-wrap={appContext.settings.writerWrapLength}
                        style:flex={showPreview
                            ? `0 0 ${appContext.settings.splitPercentage * 100}%`
                            : '1 1 100%'}>
                        <Editor tabId={appContext.app.activeTabId} />
                    </div>

                    {#if showPreview}
                        <div
                            role="button"
                            tabindex="0"
                            aria-label="Resize split view"
                            class="resize-handle"
                            style:cursor={splitResize.resizeCursor}
                            onmousedown={onResizeMouseDown}
                            ondblclick={splitResize.resetSplit}
                            onkeydown={() => {}}></div>
                    {/if}

                    {#if showPreview}
                        <div class="flex-1-height-100 min-w-0 min-h-0">
                            <Preview tabId={appContext.app.activeTabId} />
                        </div>
                    {/if}
                </div>
            {:else}
                <div
                    class="text-fg-muted flex flex-1 flex-col items-center justify-center select-none">
                    <Logo class="mb-4 h-16 w-16 opacity-50 grayscale" />
                    <p class="text-sm">Ctrl+N to create a new file</p>
                </div>
            {/if}

        </div>

        {#if !appContext.app.writerMode}
            <StatusBar />
        {/if}
    </div>

    <Toast />
</AppLifecycle>

<style>
    .app-shell {
        position: relative;
    }

    .ft-peek-edge {
        display: flex;
        align-items: center;
        width: 1.625rem;
        height: 100%;
        padding-left: 0.5rem;
        background-color: var(--surface-2);
        border-right: 1px solid var(--border-primary);
        border-left: 1px solid var(--border-primary);
        transition: background-color 150ms ease-out;
    }

    .ft-peek-edge:hover {
        background-color: var(--surface-hover);
    }

    .ft-peek {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        flex: 1;
    }
</style>
