<script lang="ts">
import { onDestroy } from 'svelte';
import AppLifecycle from '$lib/components/app/AppLifecycle.svelte';
import Editor from '$lib/components/editor/Editor.svelte';
import { createSplitResize } from '$lib/components/editor/logic/splitResize.svelte';
import Preview from '$lib/components/preview/Preview.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import StatusBar from '$lib/components/ui/StatusBar.svelte';
import TabBar from '$lib/components/ui/TabBar.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';
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

let showPreview = $derived(appContext.app.splitView && isMarkdown);

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
        class="bg-bg-main text-fg-default flex h-screen w-screen flex-col overflow-hidden"
        style="position: relative;">
        {#if !appContext.app.writerMode}
            <TabBar />
        {/if}

        <div
            class="relative z-0 flex flex-1 overflow-hidden outline-none"
            class:writer-mode={appContext.app.writerMode}
            bind:this={mainContainer}>
            {#if appContext.app.activeTabId}
                    <div
                        class="flex h-full w-full"
                        class:flex-row={splitResize.isVertical}
                        class:flex-col={!splitResize.isVertical}>
                    <div
                        class="writer-content"
                        style="flex: {showPreview
                            ? `0 0 ${appContext.app.splitPercentage * 100}%`
                            : '1 1 100%'}; height: 100%; overflow: hidden;">
                        <Editor tabId={appContext.app.activeTabId} />
                    </div>

                    {#if showPreview}
                        <div
                            role="button"
                            tabindex="0"
                            aria-label="Resize split view"
                            class="resize-handle"
                            style="cursor: {splitResize.resizeCursor};"
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
