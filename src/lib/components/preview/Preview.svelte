<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { CONFIG } from "$lib/utils/config";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
    import { FileText, FlipHorizontal, FlipVertical } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let isRendering = $state(false);
    let htmlContent = $state("");
    let lastRendered = $state("");
    let lastTabId = $state("");
    let debounceTimer: number | null = null;

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);

    $effect(() => {
        if (lastTabId !== tabId) {
            lastTabId = tabId;
            lastRendered = "";
            htmlContent = "";
        }

        const tab = appContext.editor.tabs.find((t) => t.id === tabId);
        const content = appContext.app.activeTabId === tabId ? tab?.content || "" : "";

        if (!isMarkdown) return;
        if (content === lastRendered && htmlContent) return;

        if (debounceTimer) clearTimeout(debounceTimer);

        isRendering = true;
        debounceTimer = window.setTimeout(async () => {
            const result = await renderMarkdown(content, appContext.app.markdownFlavor, tabId);
            htmlContent = result.html;
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

<!-- Added 'group/preview' to isolate hover state from child components like scrollbars -->
<div class="relative w-full h-full border-l bg-bg-preview border-border-main group/preview">
    <div class="absolute top-2 right-2 z-10">
        <!-- Uses 'group-hover/preview' to only react to the preview pane hover -->
        <button type="button" class="p-2 rounded opacity-0 group-hover/preview:opacity-100 transition-opacity duration-200 bg-bg-panel border border-border-main hover:bg-white/20" onclick={() => appContext.app.toggleOrientation()} use:tooltip={appContext.app.splitOrientation === "vertical" ? "Switch to Horizontal Split" : "Switch to Vertical Split"}>
            {#if appContext.app.splitOrientation === "vertical"}<FlipVertical size={16} />{:else}<FlipHorizontal size={16} />{/if}
        </button>
    </div>

    <div
        bind:this={container}
        id="active-preview-container"
        onclick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (a) {
                e.preventDefault();
                navigateToPath(a.getAttribute("href") || "");
            }
        }}
        role="none"
        class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0 bg-bg-preview text-fg-default"
        style="font-family: {appContext.app.previewFontFamily}; font-size: {appContext.app.previewFontSize}px;"
    >
        {#if !isMarkdown}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none">
                <FileText size={64} class="mb-4" />
                <p>Preview not available for this file type</p>
            </div>
        {:else if isRendering && !htmlContent}
            <div class="absolute inset-0 flex items-center justify-center opacity-50">Rendering...</div>
        {:else if !htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                <img src="/logo.svg" alt="Logo" class="w-24 h-24 mb-4 grayscale" />
                <h1 class="text-3xl font-bold">MarkdownRS</h1>
            </div>
        {:else}
            {@html htmlContent}
        {/if}
    </div>

    {#if container && isMarkdown}
        <CustomScrollbar viewport={container} />
    {/if}
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
