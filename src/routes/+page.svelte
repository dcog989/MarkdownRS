<script lang="ts">
    import Editor from '$lib/components/editor/Editor.svelte';
    import Preview from '$lib/components/preview/Preview.svelte';
    import StatusBar from '$lib/components/ui/StatusBar.svelte';
    import TabBar from '$lib/components/ui/TabBar.svelte';
    import Titlebar from '$lib/components/ui/Titlebar.svelte';
    import Toast from '$lib/components/ui/Toast.svelte';
    import { loadTabContentLazy } from '$lib/services/sessionPersistence';
    import { addTab, pushToMru } from '$lib/stores/editorStore.svelte';
    import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { CONFIG } from '$lib/utils/config';
    import {
        loadSession,
        openFileByPath,
        persistSession,
        persistSessionDebounced,
    } from '$lib/utils/fileSystem.ts';
    import { isMarkdownFile } from '$lib/utils/fileValidation';
    import { logger } from '$lib/utils/logger';
    import { initSettings, saveSettings } from '$lib/utils/settings';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { onDestroy, onMount } from 'svelte';

    // Linux: resize handles for undecorated windows (wry doesn't provide edge
    // resize on GTK with decorations:false). Call startResizeDragging on mousedown
    // at each window edge. ResizeDirection enum values from Tauri.
    type ResizeDir = 'North'|'South'|'East'|'West'|'NorthEast'|'NorthWest'|'SouthEast'|'SouthWest';
    async function startWindowResize(dir: ResizeDir) {
        try {
            await getCurrentWindow().startResizeDragging(dir as any);
        } catch {}
    }

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;
    let isUnloading = false;
    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    let activeTab = $derived(
        appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId),
    );

    // Track tab switches for performance monitoring
    let previousTabId = $state<string | null>(null);

    // Lazy load tab content when switching tabs
    $effect(() => {
        const tab = activeTab;
        const currentTabId = tab?.id || null;

        // Log tab switch if the tab changed and app is initialized
        if (isInitialized && currentTabId && currentTabId !== previousTabId) {
            logger.editor.debug('TabSwitched', {
                from: previousTabId || 'none',
                to: currentTabId,
                title: tab?.title || 'unknown',
            });

            previousTabId = currentTabId;
        }

        if (tab && !tab.contentLoaded && isInitialized) {
            const loadStart = performance.now();
            loadTabContentLazy(tab.id)
                .then(() => {
                    const duration = (performance.now() - loadStart).toFixed(2);
                    logger.session.debug('TabContentLoaded', {
                        tabId: tab.id,
                        duration: `${duration}ms`,
                    });
                })
                .catch((err) => {
                    console.error('Failed to lazy load tab content:', err);
                });
        }
    });

    // Determine if the file is markdown based on saved path or preferred extension for unsaved files
    let isMarkdown = $derived.by(() => {
        if (!activeTab) return true;

        // For saved files, check the path
        if (activeTab.path) {
            return isMarkdownFile(activeTab.path);
        }

        // For unsaved files, use the preferred extension
        return activeTab.preferredExtension !== 'txt';
    });

    let showPreview = $derived(appContext.app.splitView && isMarkdown);

    function handleTabNavigation(e: KeyboardEvent) {
        if (!e.ctrlKey) return;

        if (e.key === 'Tab') {
            return;
        }

        if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            e.stopImmediatePropagation();

            const currentIndex = appContext.editor.tabs.findIndex(
                (t: EditorTab) => t.id === appContext.app.activeTabId,
            );
            if (currentIndex === -1) return;

            let newIndex;
            if (e.key === 'PageUp') {
                newIndex = currentIndex - 1;
                if (newIndex < 0) newIndex = appContext.editor.tabs.length - 1;
            } else {
                newIndex = currentIndex + 1;
                if (newIndex >= appContext.editor.tabs.length) newIndex = 0;
            }

            const newTab = appContext.editor.tabs[newIndex];
            if (newTab) {
                appContext.app.activeTabId = newTab.id;
                pushToMru(newTab.id);
            }
        }
    }

    onMount(() => {
        const appStartTime = performance.now();

        (async () => {
            try {
                const settingsStart = performance.now();
                await initSettings();
                const settingsDuration = (performance.now() - settingsStart).toFixed(2);
                logger.editor.debug('SettingsInitialized', { duration: `${settingsDuration}ms` });

                const sessionStart = performance.now();
                await loadSession();
                const sessionDuration = (performance.now() - sessionStart).toFixed(2);
                logger.session.info('SessionRestored', { duration: `${sessionDuration}ms` });

                if (appContext.editor.tabs.length === 0) {
                    const id = addTab();
                    appContext.app.activeTabId = id;
                }

                const appDuration = (performance.now() - appStartTime).toFixed(2);
                logger.editor.info('AppInitialized', { duration: `${appDuration}ms` });

                isInitialized = true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('Initialization Failed:', msg);
                initError = msg;
                isInitialized = true;
            }
        })();

        let unlistenFileOpen: (() => void) | null = null;
        let unlistenDragDrop: (() => void) | null = null;

        import('@tauri-apps/api/event').then(({ listen }) => {
            // CLI / External Argument handling
            listen<string>('open-file-from-args', async (event) => {
                const filePath = event.payload;
                await openFileByPath(filePath);
            }).then((unlisten) => {
                unlistenFileOpen = unlisten;
            });

            // Drag and Drop handling
            listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
                for (const path of event.payload.paths) {
                    await openFileByPath(path);
                }
            }).then((unlisten) => {
                unlistenDragDrop = unlisten;
            });
        });

        document.addEventListener('keydown', handleTabNavigation, { capture: true });

        if (!initError) {
            autoSaveInterval = window.setInterval(() => {
                if (appContext.editor.sessionDirty) {
                    persistSession();
                }
                saveSettings();
            }, CONFIG.SESSION.AUTO_SAVE_INTERVAL_MS);
        }

        const handleBlur = () => {
            persistSession();
            saveSettings();
        };

        const handleBeforeUnload = () => {
            isUnloading = true;

            // Cancel any pending debounced saves to prevent race conditions during unload
            persistSessionDebounced.clear();

            if (window._editorFlushFunctions) {
                window._editorFlushFunctions.forEach((fn) => fn());
            }
            // Force immediate save before window closes
            persistSession();
            saveSettings();
        };

        window.addEventListener('blur', handleBlur);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            document.removeEventListener('keydown', handleTabNavigation, { capture: true });
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (unlistenFileOpen) unlistenFileOpen();
            if (unlistenDragDrop) unlistenDragDrop();
        };
    });

    onDestroy(() => {
        if (autoSaveInterval !== null) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }

        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);

        // Only trigger cleanup saves if we are NOT in the process of unloading via browser event
        // This prevents double-saving and race conditions during app exit
        if (!isUnloading) {
            persistSessionDebounced.clear();
            persistSession();
            saveSettings();
        }
    });

    function startResize(e: MouseEvent) {
        e.preventDefault();
        isDragging = true;
        dragStart = appContext.app.splitOrientation === 'vertical' ? e.clientX : e.clientY;
        initialSplit = appContext.app.splitPercentage;
        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
        document.body.style.cursor =
            appContext.app.splitOrientation === 'vertical' ? 'col-resize' : 'row-resize';
    }

    function handleResize(e: MouseEvent) {
        if (!isDragging || !mainContainer) return;
        const rect = mainContainer.getBoundingClientRect();
        const totalSize = appContext.app.splitOrientation === 'vertical' ? rect.width : rect.height;
        const currentPos = appContext.app.splitOrientation === 'vertical' ? e.clientX : e.clientY;
        const deltaPixels = currentPos - dragStart;
        const deltaPercent = deltaPixels / totalSize;
        let newSplit = initialSplit + deltaPercent;

        newSplit = Math.max(0.1, Math.min(0.9, newSplit));
        appContext.app.splitPercentage = newSplit;
    }

    function stopResize() {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = 'default';
        saveSettings();
    }

    function resetSplit() {
        appContext.app.splitPercentage = 0.5;
        saveSettings();
    }
</script>

{#if !isInitialized}
    <div
        class="bg-bg-main text-fg-default flex h-screen w-screen flex-col items-center justify-center">
        <img src="/logo.svg" alt="App Logo" class="mb-4 h-16 w-16 animate-pulse opacity-50" />
        <p class="text-fg-muted text-sm">Loading MarkdownRS...</p>
        {#if initError}
            <p class="text-danger-text mt-2 text-xs">{initError}</p>
        {/if}
    </div>
{:else}
    <div class="bg-bg-main text-fg-default flex h-screen w-screen flex-col overflow-hidden" style="position: relative; border-radius: 8px;">
        <!-- Window border: inset box-shadow renders inside bounds, not clipped -->
        <div style="position:fixed;inset:0;box-shadow:inset 0 0 0 1px var(--color-border-main);border-radius:8px;pointer-events:none;z-index:10000;"></div>
        <!-- Linux undecorated window resize handles -->
        <div style="position:fixed;top:0;left:4px;right:4px;height:4px;cursor:n-resize;z-index:9999;" onmousedown={() => startWindowResize('North')}></div>
        <div style="position:fixed;bottom:0;left:4px;right:4px;height:4px;cursor:s-resize;z-index:9999;" onmousedown={() => startWindowResize('South')}></div>
        <div style="position:fixed;top:4px;left:0;bottom:4px;width:4px;cursor:w-resize;z-index:9999;" onmousedown={() => startWindowResize('West')}></div>
        <div style="position:fixed;top:4px;right:0;bottom:4px;width:4px;cursor:e-resize;z-index:9999;" onmousedown={() => startWindowResize('East')}></div>
        <div style="position:fixed;top:0;left:0;width:8px;height:8px;cursor:nw-resize;z-index:9999;" onmousedown={() => startWindowResize('NorthWest')}></div>
        <div style="position:fixed;top:0;right:0;width:8px;height:8px;cursor:ne-resize;z-index:9999;" onmousedown={() => startWindowResize('NorthEast')}></div>
        <div style="position:fixed;bottom:0;left:0;width:8px;height:8px;cursor:sw-resize;z-index:9999;" onmousedown={() => startWindowResize('SouthWest')}></div>
        <div style="position:fixed;bottom:0;right:0;width:8px;height:8px;cursor:se-resize;z-index:9999;" onmousedown={() => startWindowResize('SouthEast')}></div>
        {#if !appContext.app.writerMode}
            <Titlebar />
            <TabBar />
        {/if}

        <div
            class="relative z-0 flex flex-1 overflow-hidden outline-none"
            class:writer-mode={appContext.app.writerMode}
            bind:this={mainContainer}>
            {#if appContext.app.activeTabId}
                <div
                    class="flex h-full w-full flex-row"
                    class:flex-column={appContext.app.splitOrientation !== 'vertical'}>
                    <div
                        class="writer-content"
                        style="flex: {showPreview
                            ? `0 0 ${appContext.app.splitPercentage * 100}%`
                            : '1 1 100%'}; height: 100%; overflow: hidden;">
                        <Editor tabId={appContext.app.activeTabId} />
                    </div>

                    {#if showPreview}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="resize-handle"
                            style="
                                cursor: {appContext.app.splitOrientation === 'vertical'
                                ? 'col-resize'
                                : 'row-resize'};
                            "
                            onmousedown={startResize}
                            ondblclick={resetSplit}>
                        </div>
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
                    <img
                        src="/logo.svg"
                        alt="App Logo"
                        class="mb-4 h-16 w-16 opacity-50 grayscale" />
                    <p class="text-sm">Ctrl+N to create a new file</p>
                </div>
            {/if}

            {#if !appContext.app.writerMode}
                <div class="position-absolute-bottom-0">
                    <StatusBar />
                </div>
            {/if}
        </div>
    </div>

    <Toast />
{/if}
