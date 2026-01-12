<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import { toggleSplitView } from '$lib/stores/appState.svelte';
    import {
        toggleAbout,
        toggleBookmarks,
        toggleCommandPalette,
        toggleSettings,
    } from '$lib/stores/interfaceStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { showToast } from '$lib/stores/toastStore.svelte';
    import { isMarkdownFile } from '$lib/utils/fileValidation';
    import { saveSettings } from '$lib/utils/settings';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { Bookmark, Copy, Eye, EyeOff, Minus, Settings, Square, X, Zap } from 'lucide-svelte';
    import { onMount } from 'svelte';

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);
    let displayPath = $derived(activeTab?.path || activeTab?.title || '');

    function toggleSplit() {
        if (!isMarkdown) {
            showToast('warning', 'Preview not available for this file type');
            return;
        }
        toggleSplitView();
        saveSettings();
    }

    onMount(() => {
        let unlisten: (() => void) | undefined;
        appWindow.isMaximized().then((m) => (isMaximized = m));

        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
            })
            .then((u) => (unlisten = u));

        return () => {
            if (unlisten) unlisten();
        };
    });

    async function closeApp() {
        await appWindow.close();
    }
</script>

<div
    class="h-9 flex items-center select-none w-full border-b shrink-0 bg-bg-titlebar border-border-main"
    style="transform: translateZ(0);"
    data-tauri-drag-region>
    <!-- Left Group: Logo, Settings, Commands, Bookmarks -->
    <div class="flex items-center px-3 gap-2 pointer-events-auto shrink-0">
        <button
            class="hover:bg-white/10 rounded p-1 pointer-events-auto outline-none"
            onclick={() => toggleAbout()}
            use:tooltip={'About MarkdownRS'}>
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        </button>
        <button
            class="hover:bg-white/10 rounded p-1 pointer-events-auto text-fg-muted outline-none"
            onclick={() => toggleSettings()}
            use:tooltip={'Settings (Ctrl+,)'}>
            <Settings size={14} />
        </button>

        <div class="w-px h-4 bg-white/10 mx-1"></div>

        <button
            class="flex items-center justify-center hover:bg-white/10 rounded p-1 text-fg-muted transition-colors border-none outline-none"
            onclick={() => toggleCommandPalette()}
            use:tooltip={'Commands (Ctrl+P)'}>
            <Zap size={14} />
        </button>
        <button
            class="flex items-center justify-center hover:bg-white/10 rounded p-1 text-fg-muted transition-colors border-none outline-none"
            onclick={() => toggleBookmarks()}
            use:tooltip={'Bookmarks (Ctrl+B)'}>
            <Bookmark size={14} />
        </button>
        <div class="w-px h-4 bg-white/10 mx-1"></div>
    </div>

    <!-- Center: File Path (Drag Region) -->
    <div
        class="flex-1 flex items-center justify-center min-w-0 px-4 text-sm text-fg-muted font-mono"
        data-tauri-drag-region>
        <span class="truncate opacity-60 hover:opacity-100 transition-opacity select-none pointer-events-none">
            {displayPath}
        </span>
    </div>

    <!-- Right Group: Preview, Window Controls -->
    <div class="flex h-full pointer-events-auto items-center shrink-0">
        <button
            class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors outline-none text-fg-muted"
            class:opacity-50={!isMarkdown}
            class:cursor-not-allowed={!isMarkdown}
            onclick={toggleSplit}
            use:tooltip={isMarkdown ? 'Toggle Split Preview (Ctrl+\\)' : 'Preview not available'}>
            {#if !isMarkdown}
                <EyeOff size={14} class="opacity-50" />
            {:else}
                <Eye size={14} class={appContext.app.splitView ? 'text-fg-default' : 'opacity-50'} />
            {/if}
        </button>

        <div class="w-px h-4 bg-white/10 mx-1"></div>

        <button
            class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-fg-muted outline-none"
            onclick={() => appWindow.minimize()}
            use:tooltip={'Minimize'}><Minus size={16} /></button>
        <button
            class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-fg-muted"
            onclick={() => appWindow.toggleMaximize()}
            use:tooltip={'Maximize / Restore'}>
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button
            class="h-full w-12 flex items-center justify-center hover:bg-danger hover:text-white text-fg-muted outline-none"
            onclick={closeApp}
            use:tooltip={'Close'}><X size={16} /></button>
    </div>
</div>
