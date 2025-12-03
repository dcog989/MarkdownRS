<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import CommandPalette from "$lib/components/ui/CommandPalette.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { loadSession, openFile, persistSession, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { initSettings, saveSettings } from "$lib/utils/settings";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number;
    let mainContainer: HTMLDivElement;
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === "s") {
                e.preventDefault();
                saveCurrentFile();
            } else if (e.key === "o") {
                e.preventDefault();
                openFile();
            } else if (e.key === "n") {
                e.preventDefault();
                const id = editorStore.addTab();
                appState.activeTabId = id;
            } else if (e.key === "w") {
                e.preventDefault();
                if (appState.activeTabId && editorStore.tabs.length > 1) {
                    editorStore.closeTab(appState.activeTabId);
                    appState.activeTabId = editorStore.tabs[0]?.id || null;
                }
            } else if (e.key === "\\") {
                e.preventDefault();
                appState.toggleSplitView();
            }
        }
    }

    // Named function to allow proper cleanup
    function handleAutoSave() {
        persistSession();
        saveSettings();
    }

    onMount(async () => {
        try {
            await initSettings();
        } catch (err) {
            console.error("Settings init failed", err);
        }

        try {
            await loadSession();
            if (editorStore.tabs.length === 0) {
                const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                appState.activeTabId = id;
            }
        } catch (error) {
            console.error("Failed to load session:", error);
            const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
            appState.activeTabId = id;
        }

        // Auto-save Setup
        autoSaveInterval = window.setInterval(handleAutoSave, 30000);
        window.addEventListener("blur", handleAutoSave);
    });

    onDestroy(() => {
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        if (typeof window !== "undefined") {
            window.removeEventListener("blur", handleAutoSave);
        }
    });

    // --- Resizing Logic ---
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
        if (newSplit < 0.1) newSplit = 0.1;
        if (newSplit > 0.9) newSplit = 0.9;
        appState.splitPercentage = newSplit;
    }

    function stopResize() {
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

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="h-screen w-screen flex flex-col overflow-hidden border" style="background-color: var(--bg-main); color: var(--fg-default); border-color: var(--border-main);">
    <CommandPalette />

    <Titlebar />

    <div class="flex-1 flex overflow-hidden relative z-0" bind:this={mainContainer}>
        {#if appState.activeTabId}
            {#key appState.activeTabId}
                <div class="flex w-full h-full" style="flex-direction: {appState.splitOrientation === 'vertical' ? 'row' : 'column'};">
                    <div style="flex: {appState.splitView ? `0 0 ${appState.splitPercentage * 100}%` : '1 1 100%'}; height: 100%; overflow: hidden;">
                        <Editor tabId={appState.activeTabId} />
                    </div>

                    {#if appState.splitView}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="z-20 hover:bg-[var(--accent-primary)] transition-colors duration-150" style="cursor: {appState.splitOrientation === 'vertical' ? 'col-resize' : 'row-resize'}; flex: 0 0 4px; background-color: var(--bg-panel);" onmousedown={startResize} ondblclick={resetSplit}></div>
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
    </div>

    <StatusBar />
</div>
