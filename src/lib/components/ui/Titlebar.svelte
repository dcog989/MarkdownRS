<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { FileText, Menu, Minus, Plus, Square, X } from "lucide-svelte";

    const appWindow = getCurrentWindow();

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

    function minimize() {
        appWindow.minimize();
    }

    function toggleMaximize() {
        appWindow.toggleMaximize();
    }

    function closeApp() {
        appWindow.close();
    }
</script>

<div class="h-10 bg-[#252526] flex items-center select-none border-b border-black w-full shrink-0">
    <!-- Left Logo Region: Explicitly Draggable -->
    <div data-tauri-drag-region class="pl-3 pr-2 h-full flex items-center justify-center cursor-default">
        <img src="/logo.svg" alt="App Logo" class="h-5 w-5 pointer-events-none" />
    </div>

    <!-- Tab Bar: Interactive (Not Draggable) -->
    <!-- We do not add data-tauri-drag-region here so tabs can be clicked and the area scrolled -->
    <div class="flex items-end overflow-x-auto no-scrollbar pt-1.5 flex-1 max-w-[calc(100%-140px)]" role="toolbar" tabindex="-1">
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

    <!-- Spacer: Explicitly Draggable -->
    <!-- This fills the remaining space between tabs and window controls -->
    <div data-tauri-drag-region class="flex-1 h-full min-w-0"></div>

    <!-- Window Controls: Interactive -->
    <div class="flex h-full ml-auto bg-[#252526]">
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

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
