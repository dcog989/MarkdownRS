<script lang="ts">
import { ChevronDown } from 'lucide-svelte';
import { onDestroy } from 'svelte';
import AppLifecycle from '$lib/components/app/AppLifecycle.svelte';
import Editor from '$lib/components/editor/Editor.svelte';
import { createSplitResize } from '$lib/components/editor/logic/splitResize.svelte';
import Preview from '$lib/components/preview/Preview.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import StatusBar from '$lib/components/ui/StatusBar.svelte';
import TabBar from '$lib/components/ui/TabBar.svelte';
import TabDropdown from '$lib/components/ui/TabDropdown.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { pushToMru } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { isMarkdownFile } from '$lib/utils/fileValidation';

const splitResize = createSplitResize();

let mainContainer = $state<HTMLDivElement>();

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
</style>
