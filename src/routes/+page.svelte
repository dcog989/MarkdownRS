<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import TabBar from "$lib/components/ui/TabBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import Toast from "$lib/components/ui/Toast.svelte";
    import { loadTabContentLazy } from "$lib/services/sessionPersistence";
    import { toggleSplitView } from "$lib/stores/appState.svelte";
    import { addTab, pushToMru } from "$lib/stores/editorStore.svelte";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { openFind, openReplace } from "$lib/stores/interfaceStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { showToast } from "$lib/stores/toastStore.svelte";
    import {
        loadSession,
        openFile,
        openFileByPath,
        persistSession,
        persistSessionDebounced,
        requestCloseTab,
        saveCurrentFile,
    } from "$lib/utils/fileSystem.ts";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { initSettings, saveSettings } from "$lib/utils/settings";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number | null = null;
    let mainContainer = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragStart = 0;
    let initialSplit = 0;

    const AUTO_SAVE_INTERVAL_MS = 5000; // 5 seconds for more frequent saves

    let isInitialized = $state(false);
    let initError = $state<string | null>(null);

    let activeTab = $derived(
        appContext.editor.tabs.find((t: EditorTab) => t.id === appContext.app.activeTabId)
    );

    // Lazy load tab content when switching tabs
    $effect(() => {
        const tab = activeTab;
        if (tab && !tab.contentLoaded && isInitialized) {
            loadTabContentLazy(tab.id).catch((err) => {
                console.error("Failed to lazy load tab content:", err);
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
        return activeTab.preferredExtension !== "txt";
    });

    let showPreview = $derived(appContext.app.splitView && isMarkdown);

    function handleDocumentKeydown(e: KeyboardEvent) {
        const isModifier = e.ctrlKey || e.metaKey;

        if (!isModifier) return;

        const key = e.key.toLowerCase();

        switch (key) {
            case "s":
                e.preventDefault();
                e.stopImmediatePropagation();
                saveCurrentFile();
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
                persistSessionDebounced();
                return;

            case "n":
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = addTab();
                appContext.app.activeTabId = id;
                return;

            case "\\":
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!isMarkdown) {
                    showToast("warning", "Preview not available for this file type");
                    return;
                }
                toggleSplitView();
                saveSettings();
                return;

            case "f":
                e.preventDefault();
                e.stopImmediatePropagation();
                openFind();
                return;

            case "h":
                e.preventDefault();
                e.stopImmediatePropagation();
                openReplace();
                return;
        }
    }

    function handleTabNavigation(e: KeyboardEvent) {
        if (!e.ctrlKey) return;

        if (e.key === "Tab") {
            return;
        }

        if (e.key === "PageUp" || e.key === "PageDown") {
            e.preventDefault();
            e.stopImmediatePropagation();

            const currentIndex = appContext.editor.tabs.findIndex(
                (t: EditorTab) => t.id === appContext.app.activeTabId
            );
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
                pushToMru(newTab.id);
            }
        }
    }

    onMount(() => {
        (async () => {
            try {
                await initSettings();
                await loadSession();

                if (appContext.editor.tabs.length === 0) {
                    const id = addTab();
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

        let unlistenFileOpen: (() => void) | null = null;
        import("@tauri-apps/api/event").then(({ listen }) => {
            listen<string>("open-file-from-args", async (event) => {
                const filePath = event.payload;
                await openFileByPath(filePath);
            }).then((unlisten) => {
                unlistenFileOpen = unlisten;
            });
        });

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

        const handleBeforeUnload = () => {
            // Flush all pending editor content updates
            if ((window as any)._editorFlushFunctions) {
                (window as any)._editorFlushFunctions.forEach((fn: () => void) => fn());
            }
            // Force immediate save before window closes
            persistSession();
            saveSettings();
        };

        window.addEventListener("blur", handleBlur);
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            document.removeEventListener("keydown", handleDocumentKeydown, { capture: true });
            document.removeEventListener("keydown", handleTabNavigation, { capture: true });
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("beforeunload", handleBeforeUnload);
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
        document.body.style.cursor =
            appContext.app.splitOrientation === "vertical" ? "col-resize" : "row-resize";
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
    <div
        class="h-screen w-screen flex items-center justify-center flex-col bg-bg-main text-fg-default"
    >
        <img src="/logo.svg" alt="App Logo" class="h-16 w-16 mb-4 opacity-50 animate-pulse" />
        <p class="text-sm text-fg-muted">Loading MarkdownRS...</p>
        {#if initError}
            <p class="text-xs mt-2 text-danger-text">{initError}</p>
        {/if}
    </div>
{:else}
    <div
        class="h-screen w-screen flex flex-col overflow-hidden border bg-bg-main text-fg-default border-border-main"
    >
        <Titlebar />
        <TabBar />

        <div
            class="flex-1 flex overflow-hidden relative z-0 outline-none"
            bind:this={mainContainer}
            style="position: relative;"
        >
            <!-- Removed #key block to allow Editor to reuse instance -->
            {#if appContext.app.activeTabId}
                <div
                    class="flex w-full h-full"
                    style="flex-direction: {appContext.app.splitOrientation === 'vertical'
                        ? 'row'
                        : 'column'};"
                >
                    <div
                        style="flex: {showPreview
                            ? `0 0 ${appContext.app.splitPercentage * 100}%`
                            : '1 1 100%'}; height: 100%; overflow: hidden;"
                    >
                        <Editor tabId={appContext.app.activeTabId} />
                    </div>

                    {#if showPreview}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="z-20 transition-colors duration-150 bg-bg-panel hover:bg-accent-primary"
                            style="
                                cursor: {appContext.app.splitOrientation === 'vertical'
                                ? 'col-resize'
                                : 'row-resize'};
                                flex: 0 0 4px;
                            "
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
            {:else}
                <div
                    class="flex-1 flex items-center justify-center select-none flex-col text-fg-muted"
                >
                    <img
                        src="/logo.svg"
                        alt="App Logo"
                        class="h-16 w-16 mb-4 opacity-50 grayscale"
                    />
                    <p class="text-sm">Ctrl+N to create a new file</p>
                </div>
            {/if}

            <div style="position: absolute; bottom: 0; left: 0; right: 0; z-index: 100;">
                <StatusBar />
            </div>
        </div>
    </div>

    <Toast />
{/if}
