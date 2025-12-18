<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { AppError } from "$lib/utils/errorHandling";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { cleanupScrollSync, createScrollSyncState, getScrollPercentage } from "$lib/utils/scrollSync";
    import { FlipHorizontal, FlipVertical } from "lucide-svelte";
    import { onDestroy } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let renderError = $state<string | null>(null);
    let isRendering = $state(false);
    let renderErrorCount = $state(0);

    // Interaction Guard
    let isHovered = false;

    const scrollSyncState = createScrollSyncState();
    let scrollSyncFrame: number | null = null;

    const MAX_RENDER_ERRORS = 3;
    const RENDER_DEBOUNCE_MS = 300;

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let targetLine = $derived(tab?.topLine || 1);

    let htmlContent = $state("");
    let renderDebounceTimer: number | null = null;
    let lastRenderedContent = "";

    $effect(() => {
        if (content === lastRenderedContent && htmlContent) return;

        if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);

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
                    htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'><strong>Rendering failed ${renderErrorCount} times:</strong><br/><code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code><p style='margin-top: 0.5rem; font-size: 0.9em;'>Check markdown syntax.</p></div>`;
                } else {
                    htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'><strong>Error rendering markdown (attempt ${renderErrorCount}/${MAX_RENDER_ERRORS}):</strong><br/><code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code></div>`;
                }
                lastRenderedContent = content;
            } finally {
                isRendering = false;
            }
        }, RENDER_DEBOUNCE_MS);

        return () => {
            if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);
        };
    });

    // Incoming Sync: Editor -> Preview
    $effect(() => {
        if (!container || !targetLine) return;

        // Guard: If mouse is hovering preview, ignore incoming scroll (prevent fighting)
        if (isHovered) return;

        if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);

        scrollSyncFrame = requestAnimationFrame(() => {
            if (!container) return;

            const anchors = Array.from(container.querySelectorAll("[data-source-line]")) as HTMLElement[];
            if (anchors.length === 0) return;

            let beforeEl: HTMLElement | null = null;
            let afterEl: HTMLElement | null = null;
            let beforeLine = 0;
            let afterLine = Infinity;

            for (const el of anchors) {
                const line = parseInt(el.getAttribute("data-source-line") || "0", 10);
                if (isNaN(line)) continue;

                if (line <= targetLine) {
                    if (line > beforeLine) {
                        beforeLine = line;
                        beforeEl = el;
                    }
                } else {
                    if (line < afterLine) {
                        afterLine = line;
                        afterEl = el;
                    }
                }
            }

            let scrollTop = 0;
            const PADDING_OFFSET = 32;

            if (beforeEl && afterEl) {
                const lineDiff = afterLine - beforeLine;
                const pixelDiff = afterEl.offsetTop - beforeEl.offsetTop;
                const progress = (targetLine - beforeLine) / lineDiff;
                scrollTop = beforeEl.offsetTop + pixelDiff * progress - PADDING_OFFSET;
            } else if (beforeEl) {
                scrollTop = beforeEl.offsetTop - PADDING_OFFSET;
            } else if (afterEl) {
                scrollTop = 0;
            }

            scrollTop = Math.max(0, scrollTop);

            if (Math.abs(container.scrollTop - scrollTop) > 10) {
                scrollSyncState.isRemoteScrolling = true;
                container.scrollTo({
                    top: scrollTop,
                    behavior: "smooth",
                });
                if (scrollSyncState.lockTimeout) clearTimeout(scrollSyncState.lockTimeout);
                scrollSyncState.lockTimeout = window.setTimeout(() => {
                    scrollSyncState.isRemoteScrolling = false;
                }, 300);
            }
            scrollSyncFrame = null;
        }) as number;

        return () => {
            if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);
        };
    });

    // Outgoing Sync: Preview -> Editor
    function handleScroll() {
        if (!container) return;

        // Guard: Only sync if this pane is actively hovered
        if (!isHovered && !scrollSyncState.isRemoteScrolling) return;
        if (scrollSyncState.isRemoteScrolling) return;

        const anchors = Array.from(container.querySelectorAll("[data-source-line]")) as HTMLElement[];
        if (anchors.length === 0) return;

        const currentScroll = container.scrollTop;
        const PADDING_OFFSET = 32;

        let bestLine = 1;

        for (const el of anchors) {
            if (el.offsetTop - PADDING_OFFSET <= currentScroll + 5) {
                bestLine = parseInt(el.getAttribute("data-source-line") || "1", 10);
            } else {
                break;
            }
        }

        const percentage = getScrollPercentage(container);
        editorStore.updateScroll(tabId, percentage, bestLine);
    }

    onDestroy(() => {
        cleanupScrollSync(scrollSyncState);
        if (scrollSyncFrame !== null) cancelAnimationFrame(scrollSyncFrame);
        if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);
    });
</script>

<div class="relative w-full h-full bg-[#1e1e1e] border-l group" style="border-color: var(--border-main);">
    <button type="button" class="absolute top-2 right-2 z-10 p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-white/20" style="background-color: var(--bg-panel); border: 1px solid var(--border-main);" onclick={() => appState.toggleOrientation()} use:tooltip={"Toggle split orientation (vertical/horizontal)"}>
        {#if appState.splitOrientation === "vertical"}
            <FlipVertical size={16} style="color: var(--fg-default);" />
        {:else}
            <FlipHorizontal size={16} style="color: var(--fg-default);" />
        {/if}
    </button>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={container} onscroll={handleScroll} onmouseenter={() => (isHovered = true)} onmouseleave={() => (isHovered = false)} class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--bg-main); color: var(--fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px;">
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
        padding-bottom: 30px !important;
        scroll-behavior: smooth !important;
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
