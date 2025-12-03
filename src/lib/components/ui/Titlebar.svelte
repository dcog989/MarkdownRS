<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Columns, Copy, FileText, Menu, Minus, Plus, Square, X } from "lucide-svelte";
    import { onMount } from "svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);

    onMount(async () => {
        isMaximized = await appWindow.isMaximized();
        // Listen for resize to update icon state
        const unlisten = await appWindow.onResized(async () => {
            isMaximized = await appWindow.isMaximized();
        });
        return () => {
            unlisten();
        };
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

    function minimize() {
        appWindow.minimize();
    }

    async function toggleMaximize() {
        await appWindow.toggleMaximize();
        isMaximized = await appWindow.isMaximized();
    }

    function closeApp() {
        appWindow.close();
    }
</script>

<div class="flex flex-col w-full shrink-0">
    <!-- ROW 1: System Titlebar (Draggable) -->
    <div class="h-9 bg-[#181818] flex items-center select-none w-full" data-tauri-drag-region>
        <!-- App Icon & Menu Trigger -->
        <div class="flex items-center px-3 gap-3 pointer-events-auto">
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
            <button class="hover:bg-[#333] rounded p-1 text-gray-400 pointer-events-auto" aria-label="Menu">
                <Menu size={14} />
            </button>
        </div>

        <!-- Draggable Title Area -->
        <div class="flex-1 flex items-center justify-center text-xs text-gray-500 font-medium" data-tauri-drag-region>MarkdownRS</div>

        <!-- Window Controls Area -->
        <div class="flex h-full pointer-events-auto items-center">
            <!-- Toggle Preview Button (Left of controls) -->
            <button class="h-full px-3 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors border-r border-[#333]" onclick={() => appState.toggleSplitView()} title={appState.splitView ? "Hide Preview" : "Show Preview"}>
                <Columns size={14} class={appState.splitView ? "text-white" : ""} />
            </button>

            <!-- Standard Controls -->
            <button class="h-full w-12 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors" onclick={minimize} aria-label="Minimize">
                <Minus size={16} />
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-[#333] text-gray-400 focus:outline-none transition-colors" onclick={toggleMaximize} aria-label="Maximize">
                {#if isMaximized}
                    <Copy size={14} class="rotate-180" /> <!-- makeshift restore icon -->
                {:else}
                    <Square size={14} />
                {/if}
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-[#e81123] hover:text-white text-gray-400 focus:outline-none transition-colors" onclick={closeApp} aria-label="Close">
                <X size={16} />
            </button>
        </div>
    </div>

    <!-- ROW 2: Document Tabs (Interactive) -->
    <div class="h-9 bg-[#252526] flex items-end w-full overflow-x-auto no-scrollbar border-b border-[#1e1e1e]">
        {#each editorStore.tabs as tab (tab.id)}
            <button
                type="button"
                class="group relative h-8 px-3 min-w-[140px] max-w-[220px] flex items-center gap-2 text-xs cursor-pointer border-r border-[#1e1e1e] outline-none text-left
                {appState.activeTabId === tab.id ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#569cd6]' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#2a2a2b] border-t-2 border-t-transparent'}"
                onclick={() => handleTabClick(tab.id)}
            >
                <FileText size={14} class="{appState.activeTabId === tab.id ? 'text-[#eac55f]' : 'opacity-70'} flex-shrink-0" />
                <span class="truncate flex-1">{tab.title}{tab.isDirty ? " ●" : ""}</span>
                <span role="button" tabindex="0" class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-600 rounded flex-shrink-0 flex items-center justify-center" onclick={(e) => handleCloseTab(e, tab.id)} onkeydown={(e) => e.key === "Enter" && handleCloseTab(e, tab.id)}>
                    <X size={12} />
                </span>
            </button>
        {/each}

        <!-- New Tab Button -->
        <button class="h-8 w-8 flex items-center justify-center hover:bg-[#333] text-gray-400 ml-1" onclick={handleNewTab}>
            <Plus size={16} />
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
