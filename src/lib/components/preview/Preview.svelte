<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { SquareSplitHorizontal, SquareSplitVertical } from "lucide-svelte";

    let { tabId } = $props<{ tabId: string }>();
    let container: HTMLDivElement;
    let renderError = $state<string | null>(null);

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let content = $derived(tab?.content || "");
    let scrollPercentage = $derived(tab?.scrollPercentage || 0);

    let htmlContent = $state("");

    $effect(() => {
        (async () => {
            renderError = null;

            if (!content || content.trim().length === 0) {
                htmlContent = "";
                return;
            }

            try {
                htmlContent = await renderMarkdown(content);
            } catch (e) {
                console.error("Markdown Render Error:", e);
                renderError = e instanceof Error ? e.message : "Unknown rendering error";
                const errorMessage = String(renderError).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                htmlContent = `<div style='color: var(--danger); padding: 1rem; border: 1px solid var(--danger); border-radius: 4px; margin: 1rem 0;'>
                    <strong>Error rendering markdown:</strong><br/>
                    <code style='display: block; margin-top: 0.5rem; font-size: 0.9em;'>${errorMessage}</code>
                </div>`;
            }
        })();
    });

    $effect(() => {
        if (!container) return;

        const maxScroll = container.scrollHeight - container.clientHeight;

        if (maxScroll > 0) {
            if (scrollPercentage === 0) {
                if (container.scrollTop !== 0) container.scrollTop = 0;
            } else if (scrollPercentage === 1) {
                if (container.scrollTop !== maxScroll) container.scrollTop = maxScroll;
            } else {
                const target = maxScroll * scrollPercentage;
                if (Math.abs(container.scrollTop - target) > 2) {
                    container.scrollTop = target;
                }
            }
        }
    });
</script>

<!-- Parent must be relative -->
<div class="relative w-full h-full bg-[#1e1e1e] border-l group block" style="border-color: var(--border-main);">
    <!-- Floating Switcher -->
    <button
        class="z-50 p-1.5 rounded-md bg-[#252526] text-[var(--fg-muted)] transition-all border shadow-md opacity-30 hover:opacity-100 cursor-pointer"
        style="
            position: absolute !important;
            top: 10px !important;
            right: 15px !important;
            border-color: var(--border-main);
        "
        title="Switch Split Orientation"
        onclick={() => appState.toggleOrientation()}
    >
        {#if appState.splitOrientation === "vertical"}
            <SquareSplitVertical size={16} />
        {:else}
            <SquareSplitHorizontal size={16} />
        {/if}
    </button>

    <!-- Content -->
    <div bind:this={container} class="w-full h-full overflow-y-auto p-8 prose prose-invert prose-sm max-w-none relative z-0" style="background-color: var(--bg-main); color: var(--fg-default);">
        {#if !htmlContent}
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
