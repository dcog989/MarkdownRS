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

<!-- Outer container: Relative to allow absolute positioning of children -->
<div class="relative w-full h-full bg-[#1e1e1e] border-l group block" style="border-color: var(--border-main);">
    <!-- Floating Switcher: Absolute, Z-Index 50 -->
    <button class="absolute top-2 right-4 z-50 p-1.5 rounded-md bg-[#252526] text-[var(--fg-muted)] transition-all border shadow-md opacity-30 hover:opacity-100 cursor-pointer" style="border-color: var(--border-main);" title="Switch Split Orientation" onclick={() => appState.toggleOrientation()}>
        {#if appState.splitOrientation === "vertical"}
            <PanelTop size={16} />
        {:else}
            <Columns size={16} />
        {/if}
    </button>

    <!-- Content: Absolute/Full or Block/Full. Using block h-full with overflow. -->
    <div bind:this={container} class="w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--bg-main); color: var(--fg-default);">
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
