<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import CommandPalette from "$lib/components/ui/CommandPalette.svelte";
    import StatusBar from "$lib/components/ui/StatusBar.svelte";
    import Titlebar from "$lib/components/ui/Titlebar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { loadSession, openFile, persistSession, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { onDestroy, onMount } from "svelte";

    let autoSaveInterval: number;

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
                // Don't close the last tab
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

    onMount(async () => {
        console.log("App mounted");
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
        autoSaveInterval = window.setInterval(() => persistSession(), 30000);
        window.addEventListener("blur", persistSession);
    });

    onDestroy(() => {
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        if (typeof window !== "undefined") {
            window.removeEventListener("blur", persistSession);
            persistSession();
        }
    });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden border border-[#333]">
    <CommandPalette />

    <!-- Top Section: Titlebar + Tabs -->
    <Titlebar />

    <!-- Main Workspace -->
    <div class="flex-1 flex overflow-hidden relative z-0">
        {#if appState.activeTabId}
            {#key appState.activeTabId}
                <!-- Editor Pane -->
                <div class="{appState.splitView ? 'w-1/2' : 'w-full'} h-full border-r border-[#333]">
                    <Editor tabId={appState.activeTabId} />
                </div>

                <!-- Preview Pane -->
                {#if appState.splitView}
                    <div class="w-1/2 h-full bg-[#1e1e1e]">
                        <Preview tabId={appState.activeTabId} />
                    </div>
                {/if}
            {/key}
        {:else}
            <div class="flex-1 flex items-center justify-center text-gray-600 select-none flex-col">
                <img src="/logo.svg" alt="App Logo" class="h-16 w-16 mb-4 opacity-50 grayscale" />
                <p class="text-sm">Ctrl+N to create a new file</p>
            </div>
        {/if}
    </div>

    <!-- Status Bar -->
    <StatusBar />
</div>
