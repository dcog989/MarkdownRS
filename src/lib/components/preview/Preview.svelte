<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { FlipHorizontal, FlipVertical } from "lucide-svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container: HTMLDivElement;
    let renderError = $state<string | null>(null);
    let isRendering = $state(false);
    let scrollSyncTimeout: number | null = null;

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let scrollPercentage = $derived(tab?.scrollPercentage || 0);

    let htmlContent = $state("");
    let renderDebounceTimer: number | null = null;

    $effect(() => {
        // Debounce markdown rendering to improve typing performance
        if (renderDebounceTimer !== null) {
            clearTimeout(renderDebounceTimer);
        }

        isRendering = true;
        renderDebounceTimer = window.setTimeout(async () => {
            renderError = null;

            if (!content || content.trim().length === 0) {
                htmlContent = "";
                isRendering = false;
                return;
            }

            try {
                const rendered = await renderMarkdown(content);
                htmlContent = rendered;
            } catch (e) {
                console.error("Markdown Render Error:", e);
                renderError = e instanceof Error ? e.message : "Unknown rendering error";
                const errorMessage = String(renderError).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'>
                    <strong>Error rendering markdown:</strong><br/>
                    <code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code>
                </div>`;
            } finally {
                isRendering = false;
            }
        }, 300); // 300ms debounce for better performance

        return () => {
            if (renderDebounceTimer !== null) {
                clearTimeout(renderDebounceTimer);
            }
        };
    });

    // Scroll sync effect - sync preview to editor scroll (debounced)
    $effect(() => {
        if (!container) return;
        
        // Access scrollPercentage to create dependency
        const currentScrollPercentage = scrollPercentage;

        // Debounce scroll sync to improve performance
        if (scrollSyncTimeout !== null) {
            clearTimeout(scrollSyncTimeout);
        }
        
        scrollSyncTimeout = window.setTimeout(() => {
            if (!container) return;
            
            const maxScroll = container.scrollHeight - container.clientHeight;

            if (maxScroll > 0) {
                // Strict precise clamping
                if (currentScrollPercentage <= 0.001) {
                    if (container.scrollTop !== 0) container.scrollTop = 0;
                } else if (currentScrollPercentage >= 0.999) {
                    if (container.scrollTop !== maxScroll) container.scrollTop = maxScroll;
                } else {
                    const target = maxScroll * currentScrollPercentage;
                    if (Math.abs(container.scrollTop - target) > 5) {
                        container.scrollTop = target;
                    }
                }
            }
            scrollSyncTimeout = null;
        }, 16); // ~60fps debounce
    });
</script>

<!-- Parent must be relative -->
<div class="relative w-full h-full bg-[#1e1e1e] border-l group" style="border-color: var(--border-main);">
    <!-- Orientation Toggle Button -->
    <button
        type="button"
        class="absolute top-2 right-2 z-10 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/20"
        style="background-color: var(--bg-panel); border: 1px solid var(--border-main);"
        onclick={() => appState.toggleOrientation()}
        title="Toggle split orientation (vertical/horizontal)"
        aria-label="Toggle split orientation"
    >
        {#if appState.splitOrientation === 'vertical'}
            <FlipVertical size={16} style="color: var(--fg-default);" />
        {:else}
            <FlipHorizontal size={16} style="color: var(--fg-default);" />
        {/if}
    </button>
    
    <!-- Content -->
    <div bind:this={container} class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--bg-main); color: var(--fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px;">
        {#if isRendering && !htmlContent}
            <div class="absolute inset-0 flex items-center justify-center text-[var(--fg-muted)] opacity-50">Loading...</div>
        {:else if !htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none select-none">
                <img src="/logo.svg" alt="Logo" class="w-24 h-24 mb-4 grayscale" />
                <h1 class="text-3xl font-bold tracking-tight" style="color: var(--fg-muted); margin: 0;">MarkdownRS</h1>
            </div>
        {:else}
            {#if renderError}
                <div role="alert" aria-live="polite"></div>
            {/if}

            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html htmlContent}
        {/if}
    </div>
</div>

<style>
    .preview-container {
        scroll-behavior: auto !important;
    }

    :global(.prose) {
        color: var(--fg-default);
    }
    :global(.prose h1),
    :global(.prose h2),
    :global(.prose h3),
    :global(.prose h4) {
        color: var(--accent-secondary);
        margin-top: 0;
    }
    :global(.prose a) {
        color: var(--accent-link);
        text-decoration: none;
    }
    :global(.prose a:hover) {
        text-decoration: underline;
    }
    :global(.prose code) {
        background-color: var(--bg-hover);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        color: #ce9178;
        font-weight: normal;
    }
    :global(.prose pre) {
        background-color: var(--bg-main);
        border: 1px solid var(--border-main);
    }
    :global(.prose blockquote) {
        border-left-color: var(--accent-primary);
        color: var(--fg-muted);
    }
    :global(.prose ul > li::marker),
    :global(.prose ol > li::marker) {
        color: var(--fg-muted);
    }
    :global(.prose hr) {
        border-color: var(--border-main);
    }
    :global(.prose strong) {
        color: var(--fg-inverse);
    }
</style>
