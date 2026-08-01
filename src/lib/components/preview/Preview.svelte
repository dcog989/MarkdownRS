<script lang="ts">
import { FileText, FlipHorizontal, FlipVertical, X } from 'lucide-svelte';
import { onDestroy } from 'svelte';
import { _ } from 'svelte-i18n';
import { tooltip } from '$lib/actions/tooltip';
import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
import Logo from '$lib/components/ui/Logo.svelte';
import { toggleOrientation, toggleSplitView } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { navigateToPath } from '$lib/utils/fileSystem';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { renderMermaidDiagrams } from '$lib/utils/mermaidRenderer';
import { PreviewRenderer } from '$lib/utils/previewRenderer.svelte';

let { tabId } = $props<{ tabId: string }>();
let container = $state<HTMLDivElement>();

const renderer = new PreviewRenderer();

let tabPath = $derived.by(() => {
    return appContext.editor.tabs.find((t) => t.id === tabId)?.path;
});

let tabContent = $derived.by(() => {
    return appContext.editor.tabs.find((t) => t.id === tabId)?.content || '';
});

let isMarkdown = $derived(tabPath ? isMarkdownFile(tabPath) : true);
let flavor = $derived(appContext.settings.markdownFlavor);

$effect(() => {
    renderer.onTabSwitch(tabId);
});

$effect(() => {
    const content = tabContent;
    const currentFlavor = flavor;

    if (!isMarkdown) return;
    if (content === renderer.lastRendered && renderer.htmlContent) return;

    return renderer.scheduleRender(content, currentFlavor, tabPath, container);
});

onDestroy(() => {
    renderer.cleanup();
});

function injectHtml(node: HTMLElement, content: string) {
    node.innerHTML = content;
    void renderMermaidDiagrams(node);

    return {
        update(newContent: string) {
            node.innerHTML = newContent;
            void renderMermaidDiagrams(node);
        },
    };
}
</script>

<div class="bg-bg-preview group/preview relative h-full w-full border-l">
    <div class="absolute top-2 right-2 z-10 flex gap-1">
        <button
            type="button"
            class="bg-bg-panel text-fg-default hover-surface rounded border p-2 shadow-lg transition-all duration-200 opacity-30 hover:opacity-100 group-hover/preview:opacity-100"
            onclick={() => toggleOrientation()}
            use:tooltip={appContext.settings.splitOrientation === 'vertical'
                ? $_('preview.switchHorizontal')
                : $_('preview.switchVertical')}>
            {#if appContext.settings.splitOrientation === 'vertical'}
                <FlipVertical size={16} />
            {:else}
                <FlipHorizontal size={16} />
            {/if}
        </button>
        <button
            type="button"
            class="bg-bg-panel text-fg-default hover-surface rounded border p-2 shadow-lg transition-all duration-200 opacity-30 hover:opacity-100 group-hover/preview:opacity-100"
            onclick={() => toggleSplitView()}
            use:tooltip={$_('preview.closePreview')}>
            <X size={16} />
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
        class="preview-root no-scrollbar bg-bg-preview relative z-0 h-full w-full max-w-none overflow-y-auto p-8 pb-40"
        style="font-family: {appContext.settings.previewFontFamily}; font-size: {appContext.settings
            .previewFontSize}px;"
        spellcheck="false">
        {#if !isMarkdown}
            <div
                class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-40 select-none">
                <FileText size={64} class="mb-4" />
                <p>{$_('preview.notAvailable')}</p>
            </div>
        {:else if renderer.showSpinner || (renderer.isRendering && !renderer.htmlContent)}
            <div class="absolute inset-0 flex items-center justify-center opacity-50">
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500"></div>
                    <div class="text-sm">{$_('preview.rendering')}</div>
                </div>
            </div>
        {:else if renderer.renderError}
            <div class="absolute inset-0 flex flex-col items-center justify-center px-8 opacity-60">
                <div class="text-danger-text text-center text-sm">{renderer.renderError}</div>
            </div>
        {:else if !renderer.htmlContent}
            <div class="absolute inset-0 flex flex-col items-center justify-center opacity-20">
                <Logo class="mb-4 h-24 w-24 grayscale" />
                <h1 class="text-3xl font-bold">{$_('app.name')}</h1>
            </div>
        {:else}
            <div class="display-contents" use:injectHtml={renderer.htmlContent}></div>
        {/if}
    </div>

    {#if container && isMarkdown}
        <CustomScrollbar viewport={container} />
    {/if}
</div>
