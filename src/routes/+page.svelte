<script lang="ts">
    import Editor from "$lib/components/editor/Editor.svelte";
    import Preview from "$lib/components/preview/Preview.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { FileText, Plus, X } from "lucide-svelte";
    import { onDestroy, onMount } from "svelte";
    import CommandPalette from "$lib/components/ui/CommandPalette.svelte";
    import { loadSession, openFile, persistSession, saveCurrentFile } from "$lib/utils/fileSystem";

    let autoSaveInterval: number;

    // Global Shortcuts
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
            }
        }
    }

    onMount(async () => {
        // Try to restore previous session
        await loadSession();

        // If no tabs were restored (fresh start), create a default tab
        if (editorStore.tabs.length === 0) {
            const id = editorStore.addTab("Untitled-1", "# Welcome to MarkdownRS\n\nStart typing...");
            appState.activeTabId = id;
        }

        // Setup periodic session persistence (Crash Recovery)
        // Save state to SQLite every 30 seconds
        autoSaveInterval = window.setInterval(() => {
            persistSession();
        }, 30000);

        // Also save when window loses focus (user switches apps)
        window.addEventListener("blur", persistSession);
    });

    onDestroy(() => {
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        if (typeof window !== "undefined") {
            window.removeEventListener("blur", persistSession);
            // Attempt one final save
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
        editorStore.closeTab(id);
        if (appState.activeTabId === id) {
            appState.activeTabId = editorStore.tabs[0]?.id || null;
        }
    }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="h-screen w-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
    <CommandPalette />

    <!-- Custom Titlebar / Tab Bar -->
    <div class="h-9 bg-[#252526] flex items-end px-2 gap-1 select-none overflow-x-auto border-b border-black">
        {#each editorStore.tabs as tab (tab.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="group relative h-8 px-3 min-w-[120px] max-w-[200px] flex items-center gap-2 text-xs cursor-pointer border-t border-r border-l border-transparent rounded-t-sm
                {appState.activeTabId === tab.id ? 'bg-[#1e1e1e] text-white border-gray-800' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#2a2a2b]'}"
                onclick={() => handleTabClick(tab.id)}
            >
                <FileText size={14} class="opacity-70" />
                <span class="truncate flex-1">{tab.title}{tab.isDirty ? " ●" : ""}</span>
                <button class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-600 rounded" onclick={(e) => handleCloseTab(e, tab.id)}>
                    <X size={12} />
                </button>
            </div>
        {/each}

        <button class="h-7 w-7 flex items-center justify-center hover:bg-[#333] rounded text-gray-400" onclick={handleNewTab}>
            <Plus size={16} />
        </button>
    </div>

    <!-- Main Workspace -->
    <div class="flex-1 flex overflow-hidden relative">
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
            <div class="flex-1 flex items-center justify-center text-gray-600 select-none">
                <div class="text-center">
                    <p class="text-xl font-medium mb-2">MarkdownRS</p>
                    <p class="text-sm">Ctrl+N to create a new file</p>
                </div>
            </div>
        {/if}
    </div>

    <!-- Status Bar -->
    <footer class="h-6 bg-[#007acc] text-white flex items-center px-3 text-xs select-none justify-between">
        <div class="flex gap-4">
            <span>{appState.activeTabId ? "Markdown" : "Ready"}</span>
        </div>
        <div class="flex gap-4">
            <span>Ln 1, Col 1</span>
            <span>UTF-8</span>
            <span class="cursor-pointer hover:bg-blue-600 px-1 rounded" onclick={() => appState.toggleSplitView()}>
                {appState.splitView ? "Hide Preview" : "Show Preview"}
            </span>
        </div>
    </footer>
</div>
