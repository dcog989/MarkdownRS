<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import CommandPalette from "$lib/components/ui/CommandPalette.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { loadSession, openFile, persistSession, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { FileText, Menu, Minus, Plus, Square, X } from "lucide-svelte";
    import { onDestroy, onMount } from "svelte";

    const appWindow = getCurrentWindow();
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

    function handleTabClick(id: string) {
        appState.activeTabId = id;
    }

    function handleNewTab() {
        const id = editorStore.addTab(`Untitled-${editorStore.tabs.length + 1}`);
        appState.activeTabId = id;
    }

    function handleCloseTab(e: Event, id: string) {
        e.stopPropagation();
        if (editorStore.tabs.length === 1) return;

        editorStore.closeTab(id);
        if (appState.activeTabId === id) {
            appState.activeTabId = editorStore.tabs[0]?.id || null;
        }
    }

    // DIAGNOSTIC WRAPPERS
    async function minimize() {
        try {
            console.log("Minimize requested");
            await appWindow.minimize();
        } catch (e) {
            console.error(e);
            alert("Minimize Error: " + JSON.stringify(e));
        }
    }

    async function toggleMaximize() {
        try {
            console.log("Maximize requested");
            await appWindow.toggleMaximize();
        } catch (e) {
            console.error(e);
            alert("Maximize Error: " + JSON.stringify(e));
        }
    }

    async function closeApp() {
        try {
            console.log("Close requested");
            await appWindow.close();
        } catch (e) {
            console.error(e);
            alert("Close Error: " + JSON.stringify(e));
        }
    }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden border border-[#333]">
    <CommandPalette />

    <!-- Custom Titlebar -->
    <!-- DIAGNOSTICS: If dragging fails, ensure 'z-0' is behind content and 'pointer-events-none' allows click-through -->
    <div class="h-10 bg-[#252526] relative flex items-center select-none border-b border-black w-full shrink-0">
        <!-- 1. Drag Region Layer (Back) -->
        <!-- Sits absolutely behind everything. Catches clicks that fall through. -->
        <div data-tauri-drag-region class="absolute inset-0 w-full h-full z-0 cursor-default"></div>

        <!-- 2. Interactive Content Layer (Front) -->
        <!-- pointer-events-none ensures this container doesn't block the drag region behind it -->
        <div class="relative flex w-full h-full z-10 pointer-events-none">
            <!-- Logo (Left) -->
            <!-- pointer-events-none allows dragging via the background layer behind the logo -->
            <div class="pl-3 pr-2 flex items-center justify-center">
                <img src="/logo.svg" alt="App Logo" class="h-5 w-5 pointer-events-none" />
            </div>

            <!-- Tab Bar -->
            <!-- pointer-events-auto restores clicking for the tabs -->
            <div class="flex items-end overflow-x-auto no-scrollbar pt-1.5 flex-1 max-w-[calc(100%-140px)] pointer-events-auto" role="toolbar" tabindex="-1">
                {#each editorStore.tabs as tab (tab.id)}
                    <button
                        type="button"
                        class="group relative h-8 px-3 min-w-[120px] max-w-[200px] flex items-center gap-2 text-xs cursor-pointer border-t border-r border-l border-transparent rounded-t-sm outline-none text-left ml-1
                        {appState.activeTabId === tab.id ? 'bg-[#1e1e1e] text-white border-gray-800' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#2a2a2b]'}"
                        onclick={() => handleTabClick(tab.id)}
                    >
                        <FileText size={14} class="opacity-70 flex-shrink-0" />
                        <span class="truncate flex-1">{tab.title}{tab.isDirty ? " ●" : ""}</span>
                        <span role="button" tabindex="0" class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-600 rounded flex-shrink-0 flex items-center justify-center" onclick={(e) => handleCloseTab(e, tab.id)} onkeydown={(e) => e.key === "Enter" && handleCloseTab(e, tab.id)}>
                            <X size={12} />
                        </span>
                    </button>
                {/each}

                <button class="h-7 w-7 flex items-center justify-center hover:bg-[#333] rounded text-gray-400 ml-1 mb-0.5 flex-shrink-0" onclick={handleNewTab}>
                    <Plus size={16} />
                </button>
            </div>

            <!-- Spacer -->
            <div class="flex-1 min-w-0"></div>

            <!-- Window Controls -->
            <!-- pointer-events-auto restores clicking for these buttons -->
            <div class="flex h-full ml-auto bg-[#252526] pointer-events-auto">
                <button class="h-10 w-12 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors" aria-label="Menu">
                    <Menu size={18} />
                </button>
                <button class="h-10 w-12 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors" onclick={minimize} aria-label="Minimize">
                    <Minus size={18} />
                </button>
                <button class="h-10 w-12 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors" onclick={toggleMaximize} aria-label="Maximize">
                    <Square size={16} />
                </button>
                <button class="h-10 w-12 flex items-center justify-center hover:bg-[#e81123] hover:text-white text-gray-400 focus:outline-none transition-colors" onclick={closeApp} aria-label="Close">
                    <X size={18} />
                </button>
            </div>
        </div>
    </div>

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
    <footer class="h-6 bg-[#7c5a73] text-white flex items-center px-3 text-xs select-none justify-between shrink-0 z-50">
        <div class="flex gap-4">
            <span>{appState.activeTabId ? "Markdown" : "Ready"}</span>
        </div>
        <div class="flex gap-4 items-center">
            <span>Ln 1, Col 1</span>
            <span>UTF-8</span>
            <button type="button" class="cursor-pointer hover:bg-black/20 px-1 rounded bg-transparent border-none text-white text-xs" onclick={() => appState.toggleSplitView()}>
                {appState.splitView ? "Hide Preview" : "Show Preview"}
            </button>
        </div>
    </footer>
</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
