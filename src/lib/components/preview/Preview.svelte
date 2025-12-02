<script lang="ts">
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { renderMarkdown } from "$lib/utils/markdown";

    let { tabId } = $props<{ tabId: string }>();
    let container: HTMLDivElement;

    // Derived state for the content of the specific tab
    let content = $derived(editorStore.tabs.find((t) => t.id === tabId)?.content || "");
    let scrollPercentage = $derived(editorStore.tabs.find((t) => t.id === tabId)?.scrollPercentage || 0);

    // Async handling of markdown rendering
    let htmlContent = $state("");

    $effect(() => {
        renderMarkdown(content).then((html) => {
            htmlContent = html;
        });
    });

    // Handle Scroll Sync
    $effect(() => {
        if (container && scrollPercentage >= 0) {
            const targetScroll = (container.scrollHeight - container.clientHeight) * scrollPercentage;
            // distinct check to prevent jitter if we implement 2-way sync later
            if (Math.abs(container.scrollTop - targetScroll) > 5) {
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
    /* Custom Markdown Styling Overrides for "Notepad++" feel */
    :global(.prose h1) {
        color: #569cd6;
        margin-top: 0;
    }
    :global(.prose h2) {
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
    }
    :global(.prose pre) {
        background-color: #1e1e1e;
        border: 1px solid #333;
    }
    :global(.prose blockquote) {
        border-left-color: #007acc;
        color: #858585;
    }
</style>
