<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { AppError } from "$lib/utils/errorHandling";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { cleanupScrollSync, createScrollSyncState, getScrollPercentage, setScrollPercentage } from "$lib/utils/scrollSync";
    import { FlipHorizontal, FlipVertical } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let renderError = $state<string | null>(null);
    let isRendering = $state(false);
    let renderErrorCount = $state(0);

    // Scroll sync state
    const scrollSyncState = createScrollSyncState();
    let scrollSyncFrame: number | null = null;

    // Configuration constants
    const MAX_RENDER_ERRORS = 3;
    const RENDER_DEBOUNCE_MS = 300;

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let scrollPercentage = $derived(tab?.scrollPercentage || 0);

    let htmlContent = $state("");
    let renderDebounceTimer: number | null = null;
    
    // Memoize rendered content to avoid re-parsing identical markdown
    let lastRenderedContent = '';

    // Debounced markdown rendering
    $effect(() => {
        // Skip if content hasn't changed
        if (content === lastRenderedContent && htmlContent) {
            return;
        }
        
        if (renderDebounceTimer !== null) {
            clearTimeout(renderDebounceTimer);
        }

        isRendering = true;
        renderDebounceTimer = window.setTimeout(async () => {
            renderError = null;

            if (!content || content.trim().length === 0) {
                htmlContent = "";
                lastRenderedContent = content;
                isRendering = false;
                renderErrorCount = 0;
                return;
            }

            try {
                const rendered = await renderMarkdown(content);
                htmlContent = rendered;
                lastRenderedContent = content;
                renderErrorCount = 0;
            } catch (e) {
                renderErrorCount++;
                AppError.log("Markdown:Render", e, { tabId, contentLength: content.length });
                renderError = e instanceof Error ? e.message : "Unknown rendering error";

                const errorMessage = String(renderError).replace(/</g, "&lt;").replace(/>/g, "&gt;");

                if (renderErrorCount >= MAX_RENDER_ERRORS) {
                    htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'>
                        <strong>Rendering failed ${renderErrorCount} times:</strong><br/>
                        <code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code>
                        <p style='margin-top: 0.5rem; font-size: 0.9em;'>Check markdown syntax. Render attempts paused to prevent performance issues.</p>
                    </div>`;
                } else {
                    htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'>
                        <strong>Error rendering markdown (attempt ${renderErrorCount}/${MAX_RENDER_ERRORS}):</strong><br/>
                        <code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code>
                    </div>`;
                }
                lastRenderedContent = content;
            } finally {
                isRendering = false;
            }
        }, RENDER_DEBOUNCE_MS);

        return () => {
            if (renderDebounceTimer !== null) {
                clearTimeout(renderDebounceTimer);
            }
        };
    });

    // Incoming Scroll Sync: Editor -> Preview
    $effect(() => {
        if (!container) return;

        const targetPercentage = scrollPercentage;

        if (scrollSyncFrame !== null) {
            cancelAnimationFrame(scrollSyncFrame);
        }

        scrollSyncFrame = requestAnimationFrame(() => {
            if (!container) return;
            setScrollPercentage(container, targetPercentage, scrollSyncState);
            scrollSyncFrame = null;
        }) as number;

        return () => {
            if (scrollSyncFrame !== null) {
                cancelAnimationFrame(scrollSyncFrame);
                scrollSyncFrame = null;
            }
        };
    });

    // Outgoing Scroll Sync: Preview -> Editor
    // Fixed: properly check the lock state before updating
    function handleScroll() {
        if (!container) return;
        
        // Don't update scroll if we're currently being remotely scrolled
        if (scrollSyncState.isRemoteScrolling) {
            return;
        }

        const percentage = getScrollPercentage(container);
        editorStore.updateScroll(tabId, percentage);
    }

    onDestroy(() => {
        cleanupScrollSync(scrollSyncState);
        if (scrollSyncFrame !== null) {
            cancelAnimationFrame(scrollSyncFrame);
        }
        if (renderDebounceTimer !== null) {
            clearTimeout(renderDebounceTimer);
        }
    });
</script>

<div class="relative w-full h-full bg-[#1e1e1e] border-l group" style="border-color: var(--border-main);">
    <!-- Orientation Toggle Button -->
    <button type="button" class="absolute top-2 right-2 z-10 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/20" style="background-color: var(--bg-panel); border: 1px solid var(--border-main);" onclick={() => appState.toggleOrientation()} use:tooltip={"Toggle split orientation (vertical/horizontal)"}>
        {#if appState.splitOrientation === "vertical"}
            <FlipVertical size={16} style="color: var(--fg-default);" />
        {:else}
            <FlipHorizontal size={16} style="color: var(--fg-default);" />
        {/if}
    </button>

    <!-- Content -->
    <div bind:this={container} onscroll={handleScroll} class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--bg-main); color: var(--fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px;">
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

    {#if container}
        <CustomScrollbar viewport={container} />
    {/if}
</div>

<style>
    .preview-container {
        scroll-behavior: auto !important;
        scrollbar-width: none;
    }
    .preview-container::-webkit-scrollbar {
        display: none;
    }

    :global(.prose) {
        color: var(--fg-default);
    }
    :global(.prose h1),
    :global(.prose h2),
    :global(.prose h3),
    :global(.prose h4) {
        color: var(--accent-secondary);
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
