<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab } from "$lib/utils/fileSystem";
    import { saveSettings } from "$lib/utils/settings";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { ChevronDown, ChevronLeft, ChevronRight, Columns, Copy, FileText, Menu, Minus, Plus, Square, X } from "lucide-svelte";
    import { onMount, tick } from "svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);

    let scrollContainer: HTMLDivElement;
    let showLeftArrow = $state(false);
    let showRightArrow = $state(false);
    let showDropdown = $state(false);

    onMount(() => {
        let unlisten: (() => void) | undefined;
        appWindow.isMaximized().then((m) => (isMaximized = m));
        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
                checkScroll();
            })
            .then((u) => {
                unlisten = u;
            });

        const interval = setInterval(checkScroll, 500);

        return () => {
            if (unlisten) unlisten();
            clearInterval(interval);
        };
    });

    function checkScroll() {
        if (scrollContainer) {
            showLeftArrow = scrollContainer.scrollLeft > 0;
            // 2px tolerance
            showRightArrow = Math.ceil(scrollContainer.scrollLeft + scrollContainer.clientWidth) < scrollContainer.scrollWidth - 2;
        }
    }

    function scroll(direction: "left" | "right") {
        if (scrollContainer) {
            const amount = 200;
            scrollContainer.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
            setTimeout(checkScroll, 350);
        }
    }

    async function scrollToActive() {
        await tick(); // Wait for DOM update to ensure new tab exists
        if (!scrollContainer) return;

        // Find the active button via data attribute
        const activeEl = scrollContainer.querySelector('[data-active="true"]');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
        setTimeout(checkScroll, 350);
    }

    function handleTabClick(id: string) {
        appState.activeTabId = id;
        editorStore.pushToMru(id);
        scrollToActive();
    }

    function handleNewTab() {
        const id = editorStore.addTab(`Untitled-${editorStore.tabs.length + 1}`);
        appState.activeTabId = id;
        scrollToActive();
    }

    function handleCloseTab(e: Event, id: string) {
        e.stopPropagation();
        requestCloseTab(id);
        setTimeout(checkScroll, 50);
    }

    function minimize() {
        appWindow.minimize();
    }
    async function toggleMaximize() {
        await appWindow.toggleMaximize();
        isMaximized = await appWindow.isMaximized();
    }
    async function closeApp() {
        await saveSettings();
        await appWindow.close();
    }

    function handleDropdownSelect(id: string) {
        handleTabClick(id);
        showDropdown = false;
    }
</script>

<div class="flex flex-col w-full shrink-0">
    <!-- ROW 1: System Titlebar -->
    <div class="h-9 flex items-center select-none w-full" style="background-color: var(--bg-titlebar);" data-tauri-drag-region>
        <div class="flex items-center px-3 gap-3 pointer-events-auto">
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
            <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-[var(--fg-muted)]" aria-label="Menu">
                <Menu size={14} />
            </button>
        </div>
        <div class="flex-1 flex items-center justify-center text-xs font-medium" style="color: var(--fg-muted);" data-tauri-drag-region>MarkdownRS</div>
        <div class="flex h-full pointer-events-auto items-center">
            <button class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors border-r" style="color: var(--fg-muted); border-color: var(--border-main);" onclick={() => appState.toggleSplitView()} title="Toggle Preview">
                <Columns size={14} class={appState.splitView ? "text-[var(--fg-default)]" : "opacity-50"} />
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)]" onclick={minimize}><Minus size={16} /></button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)]" onclick={toggleMaximize}>
                {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
            </button>
            <button class="h-full w-12 flex items-center justify-center hover:bg-[var(--danger)] hover:text-white text-[var(--fg-muted)]" onclick={closeApp}><X size={16} /></button>
        </div>
    </div>

    <!-- ROW 2: Tabs -->
    <div class="h-9 flex items-end w-full border-b relative" style="background-color: var(--bg-panel); border-color: var(--border-main);">
        {#if showLeftArrow}
            <button class="h-8 w-6 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] z-10 bg-[var(--bg-panel)] border-r border-[var(--border-main)]" onclick={() => scroll("left")}>
                <ChevronLeft size={14} />
            </button>
        {/if}

        <div bind:this={scrollContainer} class="flex-1 flex items-end overflow-x-auto no-scrollbar scroll-smooth h-full" onscroll={checkScroll}>
            {#each editorStore.tabs as tab (tab.id)}
                {@const isActive = appState.activeTabId === tab.id}
                <button
                    type="button"
                    data-active={isActive}
                    class="group relative h-8 px-3 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0"
                    style="
                        background-color: {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'};
                        color: {isActive ? 'var(--fg-default)' : 'var(--fg-muted)'};
                        border-color: var(--border-main);
                        border-top: 2px solid {isActive ? 'var(--accent-secondary)' : 'transparent'};
                        min-width: {appState.tabWidthMin}px;
                        max-width: {appState.tabWidthMax}px;
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

            <button class="h-8 w-8 flex items-center justify-center hover:bg-white/10 ml-1 text-[var(--fg-muted)] shrink-0" onclick={handleNewTab}>
                <Plus size={16} />
            </button>
        </div>

        {#if showRightArrow}
            <button class="h-8 w-6 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)] z-10 bg-[var(--bg-panel)] border-l border-[var(--border-main)]" onclick={() => scroll("right")}>
                <ChevronRight size={14} />
            </button>
        {/if}

        <div class="relative h-8 border-l border-[var(--border-main)]">
            <button class="h-full px-2 flex items-center gap-1 hover:bg-white/10 text-[var(--fg-muted)] text-xs" onclick={() => (showDropdown = !showDropdown)}>
                <span>{editorStore.tabs.length}</span>
                <ChevronDown size={12} />
            </button>

            {#if showDropdown}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => (showDropdown = false)}></div>
                <div class="absolute right-0 top-full mt-1 w-64 max-h-[300px] overflow-y-auto bg-[#252526] border border-[#333] shadow-xl rounded-b-md z-50 py-1">
                    {#each editorStore.tabs as tab}
                        <button type="button" class="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/10" style="color: {appState.activeTabId === tab.id ? 'var(--accent-secondary)' : 'var(--fg-muted)'}" onclick={() => handleDropdownSelect(tab.id)}>
                            <FileText size={14} />
                            <span class="truncate flex-1">{tab.title}</span>
                            {#if tab.isDirty}<span class="w-2 h-2 rounded-full bg-white"></span>{/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
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
