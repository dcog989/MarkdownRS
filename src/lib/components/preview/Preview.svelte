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
    let isRendering = $state(false);

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");

    let htmlContent = $state("");
    let lastRenderedContent = "";
    let renderDebounceTimer: number | null = null;

    $effect(() => {
        if (content === lastRenderedContent && htmlContent) return;
        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);

        isRendering = true;
        renderDebounceTimer = window.setTimeout(async () => {
            try {
                htmlContent = await renderMarkdown(content, appState.gfmEnabled);
                lastRenderedContent = content;
                if (container) {
                    scrollSync.registerPreview(container);
                    await scrollSync.updateMap();
                }
            } finally {
                isRendering = false;
            }
        }, CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);

        return () => {
            if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        };
    });

    function handleScroll() {
        scrollSync.syncEditorToPreview();
    }

    function handleLink(e: MouseEvent | KeyboardEvent) {
        const target = e.target as HTMLElement;
        const link = target.closest("a");
        if (link) {
            const href = link.getAttribute("href");
            if (href && !href.startsWith("http") && !href.startsWith("#")) {
                e.preventDefault();
                navigateToPath(href);
            }
        }
    }

    onDestroy(() => {
        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    });
</script>

<div class="relative w-full h-full bg-[#1e1e1e] border-l group" style="border-color: var(--color-border-main);">
    <button type="button" class="absolute top-2 right-2 z-10 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/20" style="background-color: var(--color-bg-panel); border: 1px solid var(--color-border-main);" onclick={() => appState.toggleOrientation()}>
        {#if appState.splitOrientation === "vertical"}
            <FlipVertical size={16} style="color: var(--color-fg-default);" />
        {:else}
            <FlipHorizontal size={16} style="color: var(--color-fg-default);" />
        {/if}
    </button>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={container} onscroll={handleScroll} onclick={handleLink} onkeydown={(e) => e.key === "Enter" && handleLink(e)} role="none" class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--color-bg-main); color: var(--color-fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px; scroll-padding-top: 32px;">
        {#if isRendering && !htmlContent}
            <div class="absolute inset-0 flex items-center justify-center text-[var(--color-fg-muted)] opacity-50 text-sm">Rendering...</div>
        {:else if !htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none select-none">
                <img src="/logo.svg" alt="Logo" class="w-24 h-24 mb-4 grayscale" />
                <h1 class="text-3xl font-bold tracking-tight" style="color: var(--color-fg-muted); margin: 0;">MarkdownRS</h1>
            </div>
        {:else}
            {@html htmlContent}
        {/if}
    </div>

    {#if container}
        <CustomScrollbar viewport={container} />
    {/if}
</div>

<style>
    .preview-container {
        scrollbar-width: none;
        padding-bottom: 50vh !important;
        scroll-behavior: smooth;
    }
    .preview-container::-webkit-scrollbar {
        display: none;
    }
    :global(.prose) {
        color: var(--color-fg-default);
    }
    :global(.prose h1:first-child) {
        margin-top: 0;
    }
    :global(.prose h1),
    :global(.prose h2),
    :global(.prose h3),
    :global(.prose h4) {
        color: var(--color-accent-secondary);
        border-bottom: 1px solid var(--color-border-main);
        padding-bottom: 0.3em;
    }
    :global(.prose a) {
        color: var(--color-accent-link);
        text-decoration: none;
    }
    :global(.prose a:hover) {
        text-decoration: underline;
    }
    :global(.prose pre) {
        background-color: var(--color-bg-main);
        border: 1px solid var(--color-border-main);
    }
    :global(.prose blockquote) {
        border-left-color: var(--color-accent-primary);
        color: var(--color-fg-muted);
    }
</style>
