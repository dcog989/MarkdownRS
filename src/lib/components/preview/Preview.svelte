<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { Columns, PanelTop } from "lucide-svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container: HTMLDivElement;

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let scrollPercentage = $derived(tab?.scrollPercentage || 0);

    let htmlContent = $state("");

    $effect(() => {
        (async () => {
            if (!content) {
                htmlContent = "<p style='color: var(--fg-muted); font-style: italic; margin-top: 1rem;'>Start typing to preview...</p>";
                return;
            }
            try {
                htmlContent = await renderMarkdown(content);
            } catch (e) {
                console.error("Markdown Render Error:", e);
                htmlContent = `<p style='color: var(--danger)'>Error rendering markdown</p>`;
            }
        })();
    });

    $effect(() => {
        if (container && scrollPercentage >= 0) {
            const targetScroll = (container.scrollHeight - container.clientHeight) * scrollPercentage;
            if (Math.abs(container.scrollTop - targetScroll) > 10) {
                container.scrollTop = targetScroll;
            }
        }
    });
</script>

<div class="flex flex-col w-full h-full bg-[#1e1e1e] border-l" style="border-color: var(--border-main);">
    <!-- Preview Toolbar -->
    <div class="h-8 flex items-center justify-end px-2 border-b shrink-0 select-none" style="background-color: var(--bg-panel); border-color: var(--border-main);">
        <span class="text-xs mr-auto pl-2 font-medium opacity-50 tracking-wider">PREVIEW</span>

        <button class="p-1 hover:bg-white/10 rounded text-[var(--fg-muted)] transition-colors" title="Switch Split Orientation" onclick={() => appState.toggleOrientation()}>
            {#if appState.splitOrientation === "vertical"}
                <PanelTop size={14} />
            {:else}
                <Columns size={14} />
            {/if}
        </button>
    </div>

    <!-- Content -->
    <div bind:this={container} class="flex-1 w-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none" style="background-color: var(--bg-main); color: var(--fg-default);">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html htmlContent}
    </div>
</div>

<style>
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
