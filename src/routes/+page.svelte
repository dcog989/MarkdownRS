<script lang="ts">
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
        // Initialization logic (async IIFE)
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
            } catch (error) {
                console.error("Initialization failed:", error);
                initError = error instanceof Error ? error.message : "Unknown initialization error";

                // Create emergency tab even if initialization failed
                const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
                appState.activeTabId = id;
                isInitialized = true;
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

        // Return cleanup function
        return () => {
            window.removeEventListener("blur", handleBlur);
        };
    });

    onDestroy(() => {
        if (autoSaveInterval !== null) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
        // Final save before unmount
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
