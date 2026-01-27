<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
    import { toggleOrientation } from '$lib/stores/appState.svelte';
    import { updateTabMetadataAndPath } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { CONFIG } from '$lib/utils/config';
    import { navigateToPath } from '$lib/utils/fileSystem';
    import { isMarkdownFile } from '$lib/utils/fileValidation';
    import { renderMarkdown } from '$lib/utils/markdownRust';
    import { scrollSync } from '$lib/utils/scrollSync.svelte.ts';
    import { FileText, FlipHorizontal, FlipVertical } from 'lucide-svelte';
    import { onDestroy, untrack } from 'svelte';

    let { tabId } = $props<{ tabId: string }>();
    let container = $state<HTMLDivElement>();
    let isRendering = $state(false);
    let htmlContent = $state('');
    let lastRendered = $state('');
    let lastTabId = $state('');
    let debounceTimer: number | null = null;
    let renderAbortController: AbortController | null = null;

    let tabPath = $derived.by(() => {
        return appContext.editor.tabs.find((t) => t.id === tabId)?.path;
    });

    let tabContent = $derived.by(() => {
        return appContext.editor.tabs.find((t) => t.id === tabId)?.content || '';
    });

    let isMarkdown = $derived(tabPath ? isMarkdownFile(tabPath) : true);
    let flavor = $derived(appContext.app.markdownFlavor);

    $effect(() => {
        if (lastTabId !== tabId) {
            lastTabId = tabId;
            lastRendered = '';
            htmlContent = '';
            if (renderAbortController) {
                renderAbortController.abort();
                renderAbortController = null;
            }
        }

        const content = tabContent;
        const currentFlavor = flavor;

        if (!isMarkdown) return;
        if (content === lastRendered && htmlContent) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        if (renderAbortController) renderAbortController.abort();

        let debounceMs = CONFIG.EDITOR.CONTENT_DEBOUNCE_MS;
        if (content.length > CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES * 2) {
            debounceMs = 500;
        } else if (content.length > CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES) {
            debounceMs = 250;
        }

        isRendering = true;
        debounceTimer = window.setTimeout(async () => {
            renderAbortController = new AbortController();
            const currentController = renderAbortController;

            try {
                const result = await renderMarkdown(content, currentFlavor === 'gfm', tabPath);

                if (currentController.signal.aborted || !result) return;

                updateTabMetadataAndPath(tabId, {
                    wordCount: result.word_count,
                });

                htmlContent = result.html;
                lastRendered = content;

                if (container) {
                    scrollSync.registerPreview(container);
                    untrack(() => scrollSync.updateMap());
                }
            } catch (err) {
                if (!currentController.signal.aborted) console.error('Preview render error:', err);
            } finally {
                if (!currentController.signal.aborted) isRendering = false;
            }
        }, debounceMs);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
        };
    });

    onDestroy(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (renderAbortController) renderAbortController.abort();
    });

    function injectHtml(node: HTMLElement, content: string) {
        node.innerHTML = content;
        return {
            update(newContent: string) {
                node.innerHTML = newContent;
            },
        };
    }
</script>

<!-- Added 'group/preview' to isolate hover state from child components like scrollbars -->
<div class="bg-bg-preview group/preview relative h-full w-full border-l">
    <div class="absolute top-2 right-2 z-10">
        <!-- Uses 'group-hover/preview' to only react to the preview pane hover -->
        <button
            type="button"
            class="bg-bg-panel text-fg-default hover-surface rounded border p-2 shadow-lg transition-all duration-200 opacity-30 hover:opacity-100 group-hover/preview:opacity-100"
            onclick={() => toggleOrientation()}
            use:tooltip={appContext.app.splitOrientation === 'vertical'
                ? 'Switch to Horizontal Split'
                : 'Switch to Vertical Split'}>
            {#if appContext.app.splitOrientation === 'vertical'}<FlipVertical
                    size={16} />{:else}<FlipHorizontal size={16} />{/if}
        </button>
    </div>

    <div
        bind:this={container}
        id="active-preview-container"
        onclick={(e) => {
            const a = (e.target as HTMLElement).closest('a');
            if (a) {
                e.preventDefault();
                navigateToPath(a.getAttribute('href') || '');
            }
        }}
        role="none"
        class="no-scrollbar bg-bg-preview relative z-0 h-full w-full max-w-none overflow-y-auto p-8 pb-40"
        style="font-family: {appContext.app.previewFontFamily}; font-size: {appContext.app
            .previewFontSize}px;"
        spellcheck="false">
        {#if !isMarkdown}
            <div
                class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none">
                <FileText size={64} class="mb-4" />
                <p>Preview not available for this file type</p>
            </div>
        {:else if isRendering && !htmlContent}
            <div class="absolute inset-0 flex items-center justify-center opacity-50">
                Rendering...
            </div>
        {:else if !htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                <img src="/logo.svg" alt="Logo" class="mb-4 h-24 w-24 grayscale" />
                <h1 class="text-3xl font-bold">MarkdownRS</h1>
            </div>
        {:else}
            <div class="display-contents" use:injectHtml={htmlContent}></div>
        {/if}
    </div>

    {#if container && isMarkdown}
        <CustomScrollbar viewport={container} />
    {/if}
</div>
