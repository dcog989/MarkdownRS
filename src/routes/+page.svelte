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
    import { error, info } from "@tauri-apps/plugin-log";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;

    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    // DIAGNOSTICS STATE
    let debugInfo = $state({
        hasFocus: false,
        visibility: "unknown",
        activeElement: "none",
        lastEvent: "none",
    });

    function updateDebug() {
        const ae = document.activeElement;
        debugInfo = {
            hasFocus: document.hasFocus(),
            visibility: document.visibilityState,
            activeElement: ae ? `${ae.tagName}.${ae.className.split(" ")[0]}` : "null",
            lastEvent: debugInfo.lastEvent,
        };
    }

    // Capture global keys to confirm window is receiving input
    async function handleGlobalKeydown(e: KeyboardEvent) {
        debugInfo.lastEvent = `Key: ${e.key}`;
        updateDebug();

        // Tab Cycling (Ctrl+Tab)
        if (e.key === "Tab" && e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            const nextId = editorStore.getNextTabId(appState.activeTabId, e.shiftKey);
            if (nextId) {
                appState.activeTabId = nextId;
                editorStore.pushToMru(nextId);
            }
            return;
        }

        // App Shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case "s":
                    e.preventDefault();
                    e.stopPropagation();
                    await saveCurrentFile();
                    break;
                case "o":
                    e.preventDefault();
                    e.stopPropagation();
                    await openFile();
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
            }
        }
    }

    onMount(() => {
        // Polling for debug overlay
        const interval = setInterval(updateDebug, 250);

        (async () => {
            try {
                await initSettings();
                await loadSession();

                if (editorStore.tabs.length === 0) {
                    const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                    appState.activeTabId = id;
                }

                isInitialized = true;
                info("[App] Initialized.");

                // MANUALLY SHOW AND FOCUS WINDOW
                // This prevents the "flash" of incorrect position by waiting for init
                const win = getCurrentWindow();
                await win.show();
                await win.setFocus();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                error(`[App] Init Failed: ${msg}`);
                initError = msg;
                isInitialized = true;

                // Ensure window shows even on error
                const win = getCurrentWindow();
                await win.show();
                await win.setFocus();
            }
        })();

        window.addEventListener("keydown", handleGlobalKeydown, { capture: true });
        window.addEventListener("focus", () => {
            info("[Window] Focus");
            updateDebug();
        });
        window.addEventListener("blur", () => {
            info("[Window] Blur");
            updateDebug();
        });

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
            window.removeEventListener("keydown", handleGlobalKeydown, { capture: true });
            window.removeEventListener("blur", handleBlur);
            clearInterval(interval);
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

<!-- DIAGNOSTIC OVERLAY -->
<div class="fixed top-12 right-4 bg-black/90 text-red-500 p-2 z-[9999] border border-red-500 font-mono text-[10px] pointer-events-auto">
    <div>Focus: {debugInfo.hasFocus}</div>
    <div>Vis: {debugInfo.visibility}</div>
    <div>Active: {debugInfo.activeElement}</div>
    <div>Event: {debugInfo.lastEvent}</div>
</div>

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
        <div class="flex-1 flex overflow-hidden relative z-0 outline-none" bind:this={mainContainer} tabindex="-1">
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
