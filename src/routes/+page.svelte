<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import TabBar from "$lib/components/ui/TabBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import Toast from "$lib/components/ui/Toast.svelte";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { loadSession, openFile, openFileByPath, persistSession, persistSessionDebounced, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { initSettings, saveSettings } from "$lib/utils/settings";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;

    // Configuration constants
    const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    let activeTab = $derived(appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId));
    // Unsaved tabs (no path) are treated as Markdown by default
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);
    let showPreview = $derived(appContext.app.splitView && isMarkdown);

    // Global Shortcut Handler (Document Level, before CodeMirror can intercept)
    function handleDocumentKeydown(e: KeyboardEvent) {
        const isModifier = e.ctrlKey || e.metaKey;

        if (!isModifier) return;

        const key = e.key.toLowerCase();

        // Critical shortcuts - ALWAYS prevent default
        switch (key) {
            case "s":
                e.preventDefault();
                e.stopImmediatePropagation(); // Stop ALL other handlers
                saveCurrentFile();
                // Use debounced version to avoid blocking on session save
                persistSessionDebounced();
                return;

            case "w":
                e.preventDefault();
                e.stopImmediatePropagation();
                if (appContext.app.activeTabId) {
                    requestCloseTab(appContext.app.activeTabId);
                }
                return;

            case "o":
                e.preventDefault();
                e.stopImmediatePropagation();
                openFile();
                // Use debounced version to avoid blocking on session save
                persistSessionDebounced();
                return;

            case "n":
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = appContext.editor.addTab();
                appContext.app.activeTabId = id;
                return;

            case "\\":
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!isMarkdown) {
                    appContext.ui.toast.warning("Preview not available for this file type");
                    return;
                }
                appContext.app.toggleSplitView();
                saveSettings();
                return;

            case "f":
                e.preventDefault();
                e.stopImmediatePropagation();
                window.dispatchEvent(new CustomEvent("open-find"));
                return;

            case "h":
                e.preventDefault();
                e.stopImmediatePropagation();
                window.dispatchEvent(new CustomEvent("open-replace"));
                return;
        }
    }

    // Tab Navigation Handler (Separate for clarity)
    function handleTabNavigation(e: KeyboardEvent) {
        if (!e.ctrlKey) return;

        if (e.key === "Tab") {
            // Let TabBar component handle this
            return;
        }

        if (e.key === "PageUp" || e.key === "PageDown") {
            e.preventDefault();
            e.stopImmediatePropagation();

            const currentIndex = appContext.editor.tabs.findIndex((t: EditorTab) => t.id === appContext.app.activeTabId);
            if (currentIndex === -1) return;

            let newIndex;
            if (e.key === "PageUp") {
                newIndex = currentIndex - 1;
                if (newIndex < 0) newIndex = appContext.editor.tabs.length - 1;
            } else {
                newIndex = currentIndex + 1;
                if (newIndex >= appContext.editor.tabs.length) newIndex = 0;
            }

            const newTab = appContext.editor.tabs[newIndex];
            if (newTab) {
                appContext.app.activeTabId = newTab.id;
                appContext.editor.pushToMru(newTab.id);
            }
        }
    }

    onMount(() => {
        (async () => {
            try {
                await initSettings();
                await loadSession();

                if (appContext.editor.tabs.length === 0) {
                    const id = appContext.editor.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                    appContext.app.activeTabId = id;
                }

                isInitialized = true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("Initialization Failed:", msg);
                initError = msg;
                isInitialized = true;
            }
        })();

        // Listen for file open events from command-line arguments
        let unlistenFileOpen: (() => void) | null = null;
        import("@tauri-apps/api/event").then(({ listen }) => {
            listen<string>("open-file-from-args", async (event) => {
                const filePath = event.payload;
                console.log("Opening file from command line:", filePath);
                await openFileByPath(filePath);
            }).then((unlisten) => {
                unlistenFileOpen = unlisten;
            });
        });

        // Add document-level shortcuts with HIGHEST priority
        document.addEventListener("keydown", handleDocumentKeydown, { capture: true });
        document.addEventListener("keydown", handleTabNavigation, { capture: true });

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
            document.removeEventListener("keydown", handleDocumentKeydown, { capture: true });
            document.removeEventListener("keydown", handleTabNavigation, { capture: true });
            window.removeEventListener("blur", handleBlur);
            if (unlistenFileOpen) unlistenFileOpen();
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
        dragStart = appContext.app.splitOrientation === "vertical" ? e.clientX : e.clientY;
        initialSplit = appContext.app.splitPercentage;
        window.addEventListener("mousemove", handleResize);
        window.addEventListener("mouseup", stopResize);
        document.body.style.cursor = appContext.app.splitOrientation === "vertical" ? "col-resize" : "row-resize";
    }

    function handleResize(e: MouseEvent) {
        if (!isDragging || !mainContainer) return;
        const rect = mainContainer.getBoundingClientRect();
        const totalSize = appContext.app.splitOrientation === "vertical" ? rect.width : rect.height;
        const currentPos = appContext.app.splitOrientation === "vertical" ? e.clientX : e.clientY;
        const deltaPixels = currentPos - dragStart;
        const deltaPercent = deltaPixels / totalSize;
        let newSplit = initialSplit + deltaPercent;

        newSplit = Math.max(0.1, Math.min(0.9, newSplit));
        appContext.app.splitPercentage = newSplit;
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
        appContext.app.splitPercentage = 0.5;
        saveSettings();
    }
</script>

{#if !isInitialized}
    <div class="h-screen w-screen flex items-center justify-center flex-col" style="background-color: var(--color-bg-main); color: var(--color-fg-default);">
        <img src="/logo.svg" alt="App Logo" class="h-16 w-16 mb-4 opacity-50 animate-pulse" />
        <p class="text-sm" style="color: var(--color-fg-muted)">Loading MarkdownRS...</p>
        {#if initError}
            <p class="text-xs mt-2" style="color: var(--color-danger-text)">{initError}</p>
        {/if}
    </div>
{:else}
    <div class="h-screen w-screen flex flex-col overflow-hidden border" style="background-color: var(--color-bg-main); color: var(--color-fg-default); border-color: var(--color-border-main);">
        <!-- Header Section -->
        <Titlebar />
        <TabBar />

        <!-- Main Workspace with StatusBar positioned on top -->
        <div class="flex-1 flex overflow-hidden relative z-0 outline-none" bind:this={mainContainer} style="position: relative;">
            {#if appContext.app.activeTabId}
                {#key appContext.app.activeTabId}
                    <div class="flex w-full h-full" style="flex-direction: {appContext.app.splitOrientation === 'vertical' ? 'row' : 'column'};">
                        <div style="flex: {showPreview ? `0 0 ${appContext.app.splitPercentage * 100}%` : '1 1 100%'}; height: 100%; overflow: hidden;">
                            <Editor tabId={appContext.app.activeTabId} />
                        </div>

                        {#if showPreview}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="z-20 transition-colors duration-150"
                                style="
                                    cursor: {appContext.app.splitOrientation === 'vertical' ? 'col-resize' : 'row-resize'};
                                    flex: 0 0 4px;
                                    background-color: var(--color-bg-panel);
                                "
                                onmouseenter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-primary)")}
                                onmouseleave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-bg-panel)")}
                                onmousedown={startResize}
                                ondblclick={resetSplit}
                            ></div>
                        {/if}

                        {#if showPreview}
                            <div style="flex: 1; height: 100%; min-width: 0; min-height: 0;">
                                <Preview tabId={appContext.app.activeTabId} />
                            </div>
                        {/if}
                    </div>
                {/key}
            {:else}
                <div class="flex-1 flex items-center justify-center select-none flex-col" style="color: var(--color-fg-muted)">
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

    <!-- Toast Notifications -->
    <Toast />
{/if}
