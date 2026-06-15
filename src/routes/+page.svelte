<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { onDestroy, onMount } from 'svelte';
import Editor from '$lib/components/editor/Editor.svelte';
import { createSplitResize } from '$lib/components/editor/logic/splitResize.svelte';
import Preview from '$lib/components/preview/Preview.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import StatusBar from '$lib/components/ui/StatusBar.svelte';
import TabBar from '$lib/components/ui/TabBar.svelte';
import Toast from '$lib/components/ui/Toast.svelte';
import { createAppInit } from '$lib/services/appInit.svelte';
import { setupAutoSave } from '$lib/services/autoSave.svelte';
import { loadTabContentLazy } from '$lib/services/sessionPersistence';
import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
import { appContext } from '$lib/stores/state.svelte.ts';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { logger } from '$lib/utils/logger';
import { formatDuration } from '$lib/utils/timing';

const appInit = createAppInit();
const autoSave = setupAutoSave();
const splitResize = createSplitResize();

let mainContainer = $state<HTMLDivElement>();

let isUnloading = false;

let previousTabId = $state<string | null>(null);

let activeTab = $derived(
    appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId),
);

$effect(() => {
    const tab = activeTab;
    const currentTabId = tab?.id || null;

    if (appInit.isInitialized && currentTabId && currentTabId !== previousTabId) {
        logger.editor.debug('TabSwitched', {
            from: previousTabId || 'none',
            to: currentTabId,
            title: tab?.title || 'unknown',
        });
        previousTabId = currentTabId;
    }

    if (tab && !tab.contentLoaded && appInit.isInitialized) {
        const loadStart = performance.now();
        loadTabContentLazy(tab.id)
            .then(() => {
                logger.session.debug('TabContentLoaded', {
                    tabId: tab.id,
                    duration: formatDuration(loadStart),
                });
            })
            .catch((err) => logger.editor.warn('TabContentLoadFailed', { tabId: tab.id, error: String(err) }));
    }
});

let isMarkdown = $derived.by(() => {
    if (!activeTab) return true;
    if (activeTab.path) return isMarkdownFile(activeTab.path);
    return activeTab.preferredExtension !== 'txt';
});

let showPreview = $derived(appContext.app.splitView && isMarkdown);

$effect(() => {
    const tab = activeTab;
    const path = tab?.path || '';
    const dirtyMarker = tab?.isDirty ? '*' : '';
    const fullTitle = path ? `${dirtyMarker}${path} - MarkdownRS` : 'MarkdownRS';
    invoke('set_window_title', { title: fullTitle });
});

$effect(() => {
    autoSave.start();
    return () => autoSave.stop();
});

onMount(() => {
    appInit.initialize().then(() => {
        appInit.startSessionPersistence();
    });

    let unlistenEvents: (() => void) | null = null;

    appInit.setupEventListeners().then((unlisten) => {
        unlistenEvents = unlisten;
    });

    const handleBlur = () => appInit.handleBlur();
    const handleBeforeUnload = () => appInit.handleBeforeUnload();

    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        if (unlistenEvents) unlistenEvents();
    };
});

onDestroy(() => {
    splitResize.cleanup();
    appInit.handleDestroy(isUnloading);
});

function onResizeMouseDown(e: MouseEvent) {
    if (mainContainer) splitResize.registerContainer(mainContainer);
    splitResize.startResize(e);
}
</script>

{#if !appInit.isInitialized}
    <div
        class="bg-bg-main text-fg-default flex h-screen w-screen flex-col items-center justify-center">
        <Logo class="mb-4 h-16 w-16 animate-pulse opacity-50" />
        <p class="text-fg-muted text-sm">Loading MarkdownRS...</p>
        {#if appInit.initError}
            <p class="text-danger-text mt-2 text-xs">{appInit.initError}</p>
        {/if}
    </div>
{:else}
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
{/if}
