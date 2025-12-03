<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { renderMarkdown } from "$lib/utils/markdown";

    let { tabId } = $props<{ tabId: string }>();
    let container: HTMLDivElement;

    // Reactively get content. If tab doesn't exist, default to empty.
    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let scrollPercentage = $derived(tab?.scrollPercentage || 0);

    let htmlContent = $state("");

    // Update HTML when content changes
    $effect(() => {
        // Wrap in immediate async to ensure reactivity works
        (async () => {
            if (!content) {
                htmlContent = "<p class='text-gray-500 italic mt-4'>Start typing to preview...</p>";
                return;
            }
            try {
                htmlContent = await renderMarkdown(content);
            } catch (e) {
                console.error("Markdown Render Error:", e);
                htmlContent = `<p class='text-red-500'>Error rendering markdown</p>`;
            }
        })();
    });

    // Handle Scroll Sync
    $effect(() => {
        if (container && scrollPercentage >= 0) {
            const targetScroll = (container.scrollHeight - container.clientHeight) * scrollPercentage;
            if (Math.abs(container.scrollTop - targetScroll) > 10) {
                container.scrollTop = targetScroll;
            }
        }
    });
</script>

<div bind:this={container} class="w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none bg-[#1e1e1e] text-[#d4d4d4]">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html htmlContent}
</div>

<style>
    /* Custom Markdown Styling Overrides */
    :global(.prose h1) {
        color: #569cd6;
        margin-top: 0;
    }
    :global(.prose h2) {
        color: #569cd6;
    }
    :global(.prose h3) {
        color: #569cd6;
    }
    :global(.prose a) {
        color: #3794ff;
        text-decoration: none;
    }
    :global(.prose a:hover) {
        text-decoration: underline;
    }
    :global(.prose code) {
        background-color: #2d2d2d;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        color: #ce9178;
        font-weight: normal;
    }
    :global(.prose pre) {
        background-color: #1e1e1e;
        border: 1px solid #333;
    }
    :global(.prose blockquote) {
        border-left-color: #007acc;
        color: #858585;
    }
    :global(.prose ul > li::marker) {
        color: #608b4e;
    }
    :global(.prose ol > li::marker) {
        color: #608b4e;
    }
    :global(.prose hr) {
        border-color: #333;
    }
    :global(.prose strong) {
        color: #569cd6;
    }
</style>
