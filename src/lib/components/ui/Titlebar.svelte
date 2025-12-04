<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Copy, Eye, Menu, Minus, Square, X } from "lucide-svelte";
    import { onMount } from "svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);

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
</script>

<div class="h-9 flex items-center select-none w-full border-b shrink-0" style="background-color: var(--bg-titlebar); border-color: var(--border-main);" data-tauri-drag-region>
    <!-- Logo / Menu -->
    <div class="flex items-center px-3 gap-3 pointer-events-auto">
        <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-[var(--fg-muted)]" aria-label="Menu">
            <Menu size={14} />
        </button>
    </div>

    <!-- Draggable Title -->
    <div class="flex-1 flex items-center justify-center text-xs font-medium" style="color: var(--fg-muted);" data-tauri-drag-region>MarkdownRS</div>

    <!-- Controls -->
    <div class="flex h-full pointer-events-auto items-center">
        <button class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors border-r" style="color: var(--fg-muted); border-color: var(--border-main);" onclick={() => appState.toggleSplitView()} title="Toggle Preview">
            <Eye size={14} class={appState.splitView ? "text-[var(--fg-default)]" : "opacity-50"} />
        </button>

        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)]" onclick={minimize}><Minus size={16} /></button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--fg-muted)]" onclick={toggleMaximize}>
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-[var(--danger)] hover:text-white text-[var(--fg-muted)]" onclick={closeApp}><X size={16} /></button>
    </div>
</div>
