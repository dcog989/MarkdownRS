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

    let activeTab = $derived(
        appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId),
    );
    let isMarkdown = $derived(
        activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true,
    );
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
    class="bg-bg-titlebar border-border-main flex h-9 w-full shrink-0 items-center border-b select-none"
    style="transform: translateZ(0);"
    data-tauri-drag-region
>
    <!-- Left Group: Logo, Settings, Commands, Bookmarks -->
    <div class="pointer-events-auto flex shrink-0 items-center gap-2 px-3">
        <button
            class="pointer-events-auto rounded p-1 outline-none hover:bg-white/10"
            onclick={() => toggleAbout()}
            use:tooltip={'About MarkdownRS'}
        >
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        </button>
        <button
            class="text-fg-muted pointer-events-auto rounded p-1 outline-none hover:bg-white/10"
            onclick={() => toggleSettings()}
            use:tooltip={'Settings (Ctrl+,)'}
        >
            <Settings size={14} />
        </button>

        <div class="mx-1 h-4 w-px bg-white/10"></div>

        <button
            class="text-fg-muted flex items-center justify-center rounded border-none p-1 transition-colors outline-none hover:bg-white/10"
            onclick={() => toggleCommandPalette()}
            use:tooltip={'Commands (Ctrl+P)'}
        >
            <Zap size={14} />
        </button>
        <button
            class="text-fg-muted flex items-center justify-center rounded border-none p-1 transition-colors outline-none hover:bg-white/10"
            onclick={() => toggleBookmarks()}
            use:tooltip={'Bookmarks (Ctrl+B)'}
        >
            <Bookmark size={14} />
        </button>
        <div class="mx-1 h-4 w-px bg-white/10"></div>
    </div>

    <!-- Center: File Path (Drag Region) -->
    <div
        class="text-fg-muted flex min-w-0 flex-1 items-center justify-center px-4 font-mono text-sm"
        data-tauri-drag-region
    >
        <span
            class="pointer-events-none truncate opacity-60 transition-opacity select-none hover:opacity-100"
        >
            {displayPath}
        </span>
    </div>

    <!-- Right Group: Preview, Window Controls -->
    <div class="pointer-events-auto flex h-full shrink-0 items-center">
        <button
            class="text-fg-muted flex h-full items-center justify-center px-3 transition-colors outline-none hover:bg-white/10 focus:outline-none"
            class:opacity-50={!isMarkdown}
            class:cursor-not-allowed={!isMarkdown}
            onclick={toggleSplit}
            use:tooltip={isMarkdown ? 'Toggle Split Preview (Ctrl+\\)' : 'Preview not available'}
        >
            {#if !isMarkdown}
                <EyeOff size={14} class="opacity-50" />
            {:else}
                <Eye
                    size={14}
                    class={appContext.app.splitView ? 'text-fg-default' : 'opacity-50'}
                />
            {/if}
        </button>

        <div class="mx-1 h-4 w-px bg-white/10"></div>

        <button
            class="text-fg-muted flex h-full w-12 items-center justify-center outline-none hover:bg-white/10"
            onclick={() => appWindow.minimize()}
            use:tooltip={'Minimize'}><Minus size={16} /></button
        >
        <button
            class="text-fg-muted flex h-full w-12 items-center justify-center hover:bg-white/10"
            onclick={() => appWindow.toggleMaximize()}
            use:tooltip={'Maximize / Restore'}
        >
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button
            class="hover:bg-danger text-fg-muted flex h-full w-12 items-center justify-center outline-none hover:text-white"
            onclick={closeApp}
            use:tooltip={'Close'}><X size={16} /></button
        >
    </div>
</div>
