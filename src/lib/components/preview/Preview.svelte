<script lang="ts">
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { logScroll } from "$lib/utils/diagnostics";
    import { AppError } from "$lib/utils/errorHandling";
    import { navigateToPath } from "$lib/utils/fileSystem";
    import { renderMarkdown } from "$lib/utils/markdownRust";
    import { FlipHorizontal, FlipVertical } from "lucide-svelte";
    import { onDestroy, tick } from "svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let isRendering = $state(false);

    // Sync Lock
    let isRemoteScrolling = false;
    let remoteScrollTimeout: number | null = null;
    let scrollRaf: number | null = null;

    const RENDER_DEBOUNCE_MS = 300;

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");

    let htmlContent = $state("");
    let renderDebounceTimer: number | null = null;
    let lastRenderedContent = "";

    // Map: Line Number -> Pixel Offset (Top)
    let lineOffsets = $state<{ line: number; top: number }[]>([]);

    async function updateLineOffsets() {
        // Capture state to local const for TS safety
        const el = container;
        if (!el) return;

        await tick();

        // Re-query in case DOM changed after tick
        const currentEl = container;
        if (!currentEl) return;

        const anchors = Array.from(currentEl.querySelectorAll("[data-source-line]")) as HTMLElement[];

        lineOffsets = anchors
            .map((anchor) => ({
                line: parseInt(anchor.getAttribute("data-source-line") || "0", 10),
                top: anchor.offsetTop, // Relative to container
            }))
            .filter((x) => !isNaN(x.line))
            .sort((a, b) => a.line - b.line);

        logScroll("Preview", "Line Offsets Updated", { count: lineOffsets.length });
    }

    $effect(() => {
        if (content === lastRenderedContent && htmlContent) return;
        if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);

        isRendering = true;
        renderDebounceTimer = window.setTimeout(async () => {
            if (!content || content.trim().length === 0) {
                htmlContent = "";
                lastRenderedContent = content;
                isRendering = false;
                lineOffsets = [];
                return;
            }
            try {
                const rendered = await renderMarkdown(content, appState.gfmEnabled);
                htmlContent = rendered;
                lastRenderedContent = content;
                await updateLineOffsets();
            } catch (e) {
                AppError.log("Markdown:Render", e);
                htmlContent = `<div style='color:red;padding:1rem;'>Render Error</div>`;
                lastRenderedContent = content;
            } finally {
                isRendering = false;
            }
        }, RENDER_DEBOUNCE_MS);

        return () => {
            if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);
        };
    });

    // RECEIVER (Driven by Editor)
    $effect(() => {
        const el = container;
        if (!el || lineOffsets.length === 0) return;

        // Reactively access store
        const currentTabState = editorStore.tabs.find((t) => t.id === tabId);

        // Ignore if we drove this
        if (editorStore.lastScrollSource === "preview") return;

        const targetLine = currentTabState?.topLine;
        if (targetLine === undefined) return;

        isRemoteScrolling = true;
        el.style.scrollBehavior = "auto";

        if (targetLine <= 1.05) {
            el.scrollTop = 0;
        } else {
            // Find bounding anchors
            let before = lineOffsets[0];
            let after = lineOffsets[lineOffsets.length - 1];

            for (let i = 0; i < lineOffsets.length; i++) {
                if (lineOffsets[i].line <= targetLine) {
                    before = lineOffsets[i];
                } else {
                    after = lineOffsets[i];
                    break;
                }
            }

            let targetScroll = 0;
            const style = window.getComputedStyle(el);
            const padding = parseFloat(style.paddingTop) || 32;

            if (before && after && before !== after) {
                const lineDiff = after.line - before.line;
                const pixelDiff = after.top - before.top;
                const progress = (targetLine - before.line) / lineDiff;

                // Align exact offsetTop to viewport top minus padding
                targetScroll = before.top + pixelDiff * progress - padding;
            } else if (before) {
                targetScroll = before.top - padding;
            }

            logScroll("Preview", "Scroll Target (Apply)", { targetLine, targetScroll });
            el.scrollTop = Math.max(0, targetScroll);
        }

        if (remoteScrollTimeout) clearTimeout(remoteScrollTimeout);
        remoteScrollTimeout = window.setTimeout(() => {
            isRemoteScrolling = false;
            if (el) el.style.scrollBehavior = "";
        }, 100);
    });

    // SOURCE (Drives Editor)
    function handleScroll() {
        const el = container;
        if (!el || lineOffsets.length === 0) return;
        if (isRemoteScrolling) return;

        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
            // Check again inside frame
            if (!container) return;
            const currentEl = container;

            const scrollTop = currentEl.scrollTop;
            const scrollHeight = currentEl.scrollHeight - currentEl.clientHeight;

            let bestLine = 1;
            let percentage = 0;

            if (scrollHeight > 0) {
                percentage = scrollTop / scrollHeight;

                if (scrollTop <= 5) {
                    bestLine = 1;
                } else {
                    const style = window.getComputedStyle(currentEl);
                    const padding = parseFloat(style.paddingTop) || 32;
                    const effectiveScroll = scrollTop + padding;

                    // Find the anchor nearest to the current scroll top
                    for (let i = 0; i < lineOffsets.length; i++) {
                        const current = lineOffsets[i];
                        const next = lineOffsets[i + 1];

                        if (current.top <= effectiveScroll) {
                            if (next && next.top > effectiveScroll) {
                                // Interpolate
                                const pixelDist = next.top - current.top;
                                const pixelProg = effectiveScroll - current.top;
                                const ratio = pixelProg / Math.max(1, pixelDist);
                                const lineDist = next.line - current.line;
                                bestLine = current.line + lineDist * ratio;
                                break;
                            } else if (!next) {
                                bestLine = current.line;
                            }
                        }
                    }
                }
            }

            logScroll("Preview", "Scroll Source", { scrollTop, bestLine });
            editorStore.updateScroll(tabId, percentage, bestLine, "preview");
            scrollRaf = null;
        });
    }

    // [Click Handlers]
    function handlePathNavigation(target: HTMLElement) {
        const link = target.closest("a");
        if (link) {
            const href = link.getAttribute("href");
            if (href && !href.startsWith("http") && !href.startsWith("#")) {
                navigateToPath(href);
                return true;
            }
        }
        return false;
    }
    function handlePreviewClick(e: MouseEvent) {
        if (handlePathNavigation(e.target as HTMLElement)) e.preventDefault();
    }
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && handlePathNavigation(e.target as HTMLElement)) e.preventDefault();
    }

    onDestroy(() => {
        if (renderDebounceTimer !== null) clearTimeout(renderDebounceTimer);
        if (remoteScrollTimeout !== null) clearTimeout(remoteScrollTimeout);
        if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
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

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={container} onscroll={handleScroll} onclick={handlePreviewClick} onkeydown={handleKeydown} class="preview-container w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--color-bg-main); color: var(--color-fg-default); font-family: {appState.previewFontFamily}; font-size: {appState.previewFontSize}px;">
        {#if isRendering && !htmlContent}
            <div class="absolute inset-0 flex items-center justify-center text-[var(--color-fg-muted)] opacity-50">Loading...</div>
        {:else if !htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none select-none">
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
        padding-bottom: 30px !important;
        scroll-behavior: smooth;
    }
    .preview-container::-webkit-scrollbar {
        display: none;
    }
    /* Typography styles kept as is */
    :global(.prose) {
        color: var(--color-fg-default);
    }
    :global(.prose h1),
    :global(.prose h2),
    :global(.prose h3),
    :global(.prose h4) {
        color: var(--color-accent-secondary);
    }
    :global(.prose a) {
        color: var(--color-accent-link);
        text-decoration: none;
    }
    :global(.prose a:hover) {
        text-decoration: underline;
    }
    :global(.prose code) {
        background-color: var(--color-bg-hover);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        color: #ce9178;
        font-weight: normal;
    }
    :global(.prose pre) {
        background-color: var(--color-bg-main);
        border: 1px solid var(--color-border-main);
    }
    :global(.prose blockquote) {
        border-left-color: var(--color-accent-primary);
        color: var(--color-fg-muted);
    }
    :global(.prose ul > li::marker),
    :global(.prose ol > li::marker) {
        color: var(--color-fg-muted);
    }
    :global(.prose hr) {
        border-color: var(--color-border-main);
    }
    :global(.prose strong) {
        color: var(--color-fg-inverse);
    }
</style>
