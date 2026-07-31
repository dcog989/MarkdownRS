<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { onDestroy, onMount } from 'svelte';
import { _ } from 'svelte-i18n';
import Logo from '$lib/components/ui/Logo.svelte';
import { createAppInit } from '$lib/services/appInit.svelte';
import { setupAutoSave } from '$lib/services/autoSave.svelte';
import { loadTabContentLazy } from '$lib/services/tabLoadStateMachine';
import type { EditorTab } from '$lib/stores/editorStore.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { logger } from '$lib/utils/logger';
import { formatDuration } from '$lib/utils/timing';

let { children } = $props();

const appInit = createAppInit();
const autoSave = setupAutoSave();

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

$effect(() => {
    const tab = activeTab;
    const path = tab?.path || '';
    const dirtyMarker = tab?.isDirty ? '*' : '';
    const appName = $_('app.name');
    const titleWithPath = $_('app.titleWithPath', { values: { path } });
    const title = path ? `${dirtyMarker}${titleWithPath}` : `${dirtyMarker}${appName}`;
    invoke('set_window_title', { title });
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
    appInit.handleDestroy(isUnloading);
});
</script>

{#if !appInit.isInitialized}
    <div
        class="bg-bg-main text-fg-default flex h-screen w-screen flex-col items-center justify-center">
        <Logo class="mb-4 h-16 w-16 animate-pulse opacity-50" />
        <p class="text-fg-muted text-sm">{$_('app.loading')}</p>
        {#if appInit.initError}
            <p class="text-danger-text mt-2 text-xs">{appInit.initError}</p>
        {/if}
    </div>
{:else}
    {@render children()}
{/if}
