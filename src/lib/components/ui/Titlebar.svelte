<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Columns, Copy, FileText, Menu, Minus, Plus, Square, X } from "lucide-svelte";
    import { onMount } from "svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);

    // FIX: onMount expects a synchronous return of the cleanup function.
    // We handle the async setup internally with .then() to avoid returning a Promise to Svelte.
    onMount(() => {
        let unlisten: (() => void) | undefined;

        // 1. Initial Check
        appWindow.isMaximized().then((m) => (isMaximized = m));

        // 2. Setup Listener
        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
            })
            .then((u) => {
                unlisten = u;
            });

        // 3. Return Synchronous Cleanup
        return () => {
            if (unlisten) unlisten();
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
    <div class="h-9 flex items-center select-none w-full" style="background-color: var(--bg-titlebar);" data-tauri-drag-region>
        <!-- App Icon & Menu Trigger -->
        <div class="flex items-center px-3 gap-3 pointer-events-auto">
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
            <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-[var(--fg-muted)]" aria-label="Menu">
                <Menu size={14} />
            </button>
        </div>

        <!-- Draggable Title Area -->
        <div class="flex-1 flex items-center justify-center text-xs font-medium" style="color: var(--fg-muted);" data-tauri-drag-region>MarkdownRS</div>

        <!-- Window Controls Area -->
        <div class="flex h-full pointer-events-auto items-center">
            <!-- Toggle Preview Button -->
            <button class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors border-r" style="color: var(--fg-muted); border-color: var(--border-main);" onclick={() => appState.toggleSplitView()} title={appState.splitView ? "Hide Preview" : "Show Preview"}>
                <Columns size={14} class={appState.splitView ? "text-[var(--fg-default)]" : ""} />
            </button>

            <!-- Standard Controls -->
            <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] focus:outline-none transition-colors" onclick={minimize} aria-label="Minimize">
                <Minus size={16} />
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] focus:outline-none transition-colors" onclick={toggleMaximize} aria-label="Maximize">
                {#if isMaximized}
                    <Copy size={14} class="rotate-180" />
                {:else}
                    <Square size={14} />
                {/if}
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-[var(--danger)] hover:text-white text-[var(--fg-muted)] focus:outline-none transition-colors" onclick={closeApp} aria-label="Close">
                <X size={16} />
            </button>
        </div>
    </div>

    <!-- ROW 2: Document Tabs (Interactive) -->
    <div class="h-9 flex items-end w-full overflow-x-auto no-scrollbar border-b" style="background-color: var(--bg-panel); border-color: var(--border-main);">
        {#each editorStore.tabs as tab (tab.id)}
            {@const isActive = appState.activeTabId === tab.id}
            <button
                type="button"
                class="group relative h-8 px-3 min-w-[140px] max-w-[220px] flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left"
                style="
                    background-color: {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'};
                    color: {isActive ? 'var(--fg-inverse)' : 'var(--fg-muted)'};
                    border-color: var(--border-main);
                    border-top: 2px solid {isActive ? 'var(--accent-secondary)' : 'transparent'};
                "
                onclick={() => handleTabClick(tab.id)}
            >
                <FileText size={14} class="flex-shrink-0" style="color: {isActive ? 'var(--accent-file)' : 'var(--fg-muted)'}" />
                <span class="truncate flex-1">{tab.title}{tab.isDirty ? " ●" : ""}</span>
                <span role="button" tabindex="0" class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/20 rounded flex-shrink-0 flex items-center justify-center" onclick={(e) => handleCloseTab(e, tab.id)} onkeydown={(e) => e.key === "Enter" && handleCloseTab(e, tab.id)}>
                    <X size={12} />
                </span>
            </button>
        {/each}

        <!-- New Tab Button -->
        <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1" style="color: var(--fg-muted)" onclick={handleNewTab}>
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
