<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import CommandPalette from "$lib/components/ui/CommandPalette.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import TabBar from "$lib/components/ui/TabBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { loadSession, openFile, persistSession, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { initSettings, saveSettings } from "$lib/utils/settings";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;

    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    async function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.key === "Tab" && e.ctrlKey) {
            e.preventDefault();
            const nextId = editorStore.getNextTabId(appState.activeTabId, e.shiftKey);
            if (nextId) {
                appState.activeTabId = nextId;
                editorStore.pushToMru(nextId);
            }
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if (e.key === "s") {
                e.preventDefault();
                await saveCurrentFile();
            } else if (e.key === "o") {
                e.preventDefault();
                await openFile();
            } else if (e.key === "n") {
                e.preventDefault();
                const id = editorStore.addTab();
                appState.activeTabId = id;
            } else if (e.key === "w") {
                e.preventDefault();
                if (appState.activeTabId) {
                    await requestCloseTab(appState.activeTabId);
                }
            } else if (e.key === "\\") {
                e.preventDefault();
                appState.toggleSplitView();
            }
        }
    }

    onMount(() => {
        // Initialization logic
        (async () => {
            try {
                // Initialize settings first
                await initSettings();

                // Load session
                await loadSession();

                // Ensure at least one tab exists
                if (editorStore.tabs.length === 0) {
                    const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                    appState.activeTabId = id;
                }

                isInitialized = true;

                // Wait for DOM paint before showing window to prevent artifacts
                requestAnimationFrame(() => {
                    requestAnimationFrame(async () => {
                        const win = getCurrentWindow();
                        await win.show();
                        await win.setFocus();
                    });
                });
            } catch (error) {
                console.error("Initialization failed:", error);
                initError = error instanceof Error ? error.message : "Unknown initialization error";

                // Create emergency tab
                const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                appState.activeTabId = id;
                isInitialized = true;

                requestAnimationFrame(async () => {
                    const win = getCurrentWindow();
                    await win.show();
                });
            }
        })();

        autoSaveInterval = window.setInterval(() => {
            persistSession();
            saveSettings();
        }, 30000);

        const handleBlur = () => {
            persistSession();
            saveSettings();
        };

        window.addEventListener("blur", handleBlur);

        return () => {
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

<svelte:window onkeydown={handleGlobalKeydown} />

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
        <CommandPalette />

        <!-- Header Section -->
        <Titlebar />
        <TabBar />

        <!-- Main Workspace -->
        <div class="flex-1 flex overflow-hidden relative z-0" bind:this={mainContainer}>
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
        </div>

        <StatusBar />
    </div>
{/if}
