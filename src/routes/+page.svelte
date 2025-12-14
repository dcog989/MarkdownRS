<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import TabBar from "$lib/components/ui/TabBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { loadSession, openFile, persistSession, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { initSettings, saveSettings } from "$lib/utils/settings";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;
    
    // Configuration constants
    const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds
    const INIT_DELAY_MS = 150; // Window state restoration delay

    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    // Global Shortcut Handler (Capturing Phase)
    async function handleGlobalKeydown(e: KeyboardEvent) {
        // Tab Cycling (Ctrl+Tab) - Let TabBar component handle this
        if (e.key === "Tab" && e.ctrlKey) {
            // Don't handle here - TabBar will handle MRU switching
            return;
        }

        // Tab Navigation (Ctrl+Left/Right)
        if (e.ctrlKey && appState.tabNavigationMode === 'arrow-keys') {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                
                const currentIndex = editorStore.tabs.findIndex(t => t.id === appState.activeTabId);
                if (currentIndex === -1) return;
                
                let newIndex;
                if (e.key === 'ArrowLeft') {
                    // Navigate to previous tab
                    newIndex = currentIndex - 1;
                    if (newIndex < 0) newIndex = editorStore.tabs.length - 1; // Wrap to end
                } else {
                    // Navigate to next tab
                    newIndex = currentIndex + 1;
                    if (newIndex >= editorStore.tabs.length) newIndex = 0; // Wrap to start
                }
                
                const newTab = editorStore.tabs[newIndex];
                if (newTab) {
                    appState.activeTabId = newTab.id;
                    editorStore.pushToMru(newTab.id);
                }
                return;
            }
        }

        // App Shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case "s":
                    e.preventDefault();
                    e.stopPropagation();
                    await saveCurrentFile();
                    // Persist session after save to ensure path is stored
                    await persistSession();
                    break;
                case "o":
                    e.preventDefault();
                    e.stopPropagation();
                    await openFile();
                    // Persist session after opening file to store it immediately
                    await persistSession();
                    break;
                case "n":
                    e.preventDefault();
                    e.stopPropagation();
                    const id = editorStore.addTab();
                    appState.activeTabId = id;
                    break;
                case "w":
                    e.preventDefault();
                    e.stopPropagation();
                    if (appState.activeTabId) {
                        await requestCloseTab(appState.activeTabId);
                    }
                    break;
                case "\\":
                    e.preventDefault();
                    e.stopPropagation();
                    appState.toggleSplitView();
                    break;
                case "f":
                    if (e.shiftKey && e.altKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        editorStore.performTextTransform('format-document');
                    }
                    break;
            }
        }
    }

    onMount(() => {
        (async () => {
            try {
                await initSettings();
                await loadSession();

                if (editorStore.tabs.length === 0) {
                    const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                    appState.activeTabId = id;
                }

                isInitialized = true;
                // Window visibility is handled by Rust backend to prevent flash
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("Initialization Failed:", msg);
                initError = msg;
                isInitialized = true;
            }
        })();

        window.addEventListener("keydown", handleGlobalKeydown, { capture: true });

        autoSaveInterval = window.setInterval(() => {
            persistSession();
            saveSettings();
        }, AUTO_SAVE_INTERVAL_MS);

        const handleBlur = () => {
            persistSession();
            saveSettings();
        };

        window.addEventListener("blur", handleBlur);

        return () => {
            window.removeEventListener("keydown", handleGlobalKeydown, { capture: true });
            window.removeEventListener("blur", handleBlur);
        };
    });

    onDestroy(() => {
        if (autoSaveInterval !== null) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
        persistSession();
        saveSettings();
    });

    function startResize(e: MouseEvent) {
        e.preventDefault();
        isDragging = true;
        dragStart = appState.splitOrientation === "vertical" ? e.clientX : e.clientY;
        initialSplit = appState.splitPercentage;
        window.addEventListener("mousemove", handleResize);
        window.addEventListener("mouseup", stopResize);
        document.body.style.cursor = appState.splitOrientation === "vertical" ? "col-resize" : "row-resize";
    }

    function handleResize(e: MouseEvent) {
        if (!isDragging || !mainContainer) return;
        const rect = mainContainer.getBoundingClientRect();
        const totalSize = appState.splitOrientation === "vertical" ? rect.width : rect.height;
        const currentPos = appState.splitOrientation === "vertical" ? e.clientX : e.clientY;
        const deltaPixels = currentPos - dragStart;
        const deltaPercent = deltaPixels / totalSize;
        let newSplit = initialSplit + deltaPercent;

        newSplit = Math.max(0.1, Math.min(0.9, newSplit));
        appState.splitPercentage = newSplit;
    }

    function stopResize() {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener("mousemove", handleResize);
        window.removeEventListener("mouseup", stopResize);
        document.body.style.cursor = "default";
        saveSettings();
    }

    function resetSplit() {
        appState.splitPercentage = 0.5;
        saveSettings();
    }
</script>

{#if !isInitialized}
    <div class="h-screen w-screen flex items-center justify-center flex-col" style="background-color: var(--bg-main); color: var(--fg-default);">
        <img src="/logo.svg" alt="App Logo" class="h-16 w-16 mb-4 opacity-50 animate-pulse" />
        <p class="text-sm" style="color: var(--fg-muted)">Loading MarkdownRS...</p>
        {#if initError}
            <p class="text-xs mt-2" style="color: var(--danger-text)">{initError}</p>
        {/if}
    </div>
{:else}
    <div class="h-screen w-screen flex flex-col overflow-hidden border" style="background-color: var(--bg-main); color: var(--fg-default); border-color: var(--border-main);">
        <!-- Header Section -->
        <Titlebar />
        <TabBar />

        <!-- Main Workspace with StatusBar positioned on top -->
        <div class="flex-1 flex overflow-hidden relative z-0 outline-none" bind:this={mainContainer} style="position: relative;">
            {#if appState.activeTabId}
                {#key appState.activeTabId}
                    <div class="flex w-full h-full" style="flex-direction: {appState.splitOrientation === 'vertical' ? 'row' : 'column'};">
                        <div style="flex: {appState.splitView ? `0 0 ${appState.splitPercentage * 100}%` : '1 1 100%'}; height: 100%; overflow: hidden;">
                            <Editor tabId={appState.activeTabId} />
                        </div>

                        {#if appState.splitView}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="z-20 transition-colors duration-150"
                                style="
                                    cursor: {appState.splitOrientation === 'vertical' ? 'col-resize' : 'row-resize'};
                                    flex: 0 0 4px;
                                    background-color: var(--bg-panel);
                                "
                                onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-primary)")}
                                onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-panel)")}
                                onmousedown={startResize}
                                ondblclick={resetSplit}
                            ></div>
                        {/if}

                        {#if appState.splitView}
                            <div style="flex: 1; height: 100%; min-width: 0; min-height: 0;">
                                <Preview tabId={appState.activeTabId} />
                            </div>
                        {/if}
                    </div>
                {/key}
            {:else}
                <div class="flex-1 flex items-center justify-center select-none flex-col" style="color: var(--fg-muted)">
                    <img src="/logo.svg" alt="App Logo" class="h-16 w-16 mb-4 opacity-50 grayscale" />
                    <p class="text-sm">Ctrl+N to create a new file</p>
                </div>
            {/if}
            
            <!-- StatusBar positioned absolutely at bottom of main workspace -->
            <div style="position: absolute; bottom: 0; left: 0; right: 0; z-index: 100;">
                <StatusBar />
            </div>
        </div>
    </div>
{/if}
