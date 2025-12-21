<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { renderMarkdown } from "$lib/utils/markdownRust";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { FlipHorizontal, FlipVertical } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let isRendering = $state(false),
        htmlContent = $state(""),
        lastRendered = "";
    let debounceTimer: number | null = null;

    $effect(() => {
        const tab = editorStore.tabs.find((t) => t.id === tabId);
        const content = appState.activeTabId === tabId ? tab?.content || "" : "";
        if (content === lastRendered && htmlContent) return;
        if (debounceTimer) clearTimeout(debounceTimer);

        isRendering = true;
        debounceTimer = window.setTimeout(async () => {
            htmlContent = await renderMarkdown(content, appState.gfmEnabled);
            lastRendered = content;
            if (container) {
                scrollSync.registerPreview(container);
                await scrollSync.updateMap();
            }
            isRendering = false;
        }, CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });

    onDestroy(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
    });
</script>

<div class="relative w-full h-full bg-[#1e1e1e] border-l group" style="border-color: var(--color-border-main);">
    <button type="button" class="absolute top-2 right-2 z-10 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/20" style="background-color: var(--color-bg-panel); border: 1px solid var(--color-border-main);" onclick={() => appState.toggleOrientation()}>
        {#if appState.splitOrientation === "vertical"}<FlipVertical size={16} />{:else}<FlipHorizontal size={16} />{/if}
    </button>

    <div
        bind:this={container}
        onscroll={() => scrollSync.syncEditorToPreview()}
        onclick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (a) {
                e.preventDefault();
                navigateToPath(a.getAttribute("href") || "");
            }
        }}
        role="none"
        class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0"
        style="background-color: var(--color-bg-main); color: var(--color-fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px;"
    >
        {#if isRendering && !htmlContent}<div class="absolute inset-0 flex items-center justify-center opacity-50">Rendering...</div>
        {:else if !htmlContent}<div class="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                <img src="/logo.svg" alt="Logo" class="w-24 h-24 mb-4 grayscale" />
                <h1 class="text-3xl font-bold">MarkdownRS</h1>
            </div>
        {:else}{@html htmlContent}{/if}
    </div>

    {#if container}<CustomScrollbar viewport={container} />{/if}
</div>

<style>
    .preview-container {
        scrollbar-width: none;
        padding-bottom: 50vh !important;
    }
    .preview-container::-webkit-scrollbar {
        display: none;
    }
    :global(.prose) {
        color: var(--color-fg-default);
    }
    :global(.prose h1),
    :global(.prose h2),
    :global(.prose h3),
    :global(.prose h4) {
        color: var(--color-accent-secondary);
        border-bottom: 1px solid var(--color-border-main);
        padding-bottom: 0.3em;
    }
</style>
