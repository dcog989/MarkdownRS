<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";

    let { 
        tab,
        isVisible = false,
        x = 0,
        y = 0
    } = $props<{
        tab: EditorTab;
        isVisible: boolean;
        x: number;
        y: number;
    }>();

    let tooltipContent = $derived.by(() => {
        if (!tab.path) return null;

        const parts: string[] = [];
        
        // Full path
        parts.push(`Path: ${tab.path}`);
        
        // Created date
        if (tab.created) {
            parts.push(`Created: ${tab.created}`);
        }
        
        // Modified date
        if (tab.modified) {
            parts.push(`Modified: ${tab.modified}`);
        }
        
        // File size
        const text = tab.content || "";
        const sizeBytes = new TextEncoder().encode(text).length;
        parts.push(`Size: ${formatFileSize(sizeBytes)}`);
        
        // Line ending
        parts.push(`Line Ending: ${tab.lineEnding}`);
        
        // Encoding
        parts.push(`Encoding: ${tab.encoding}`);
        
        return parts.join('\n');
    });
</script>

{#if isVisible && tooltipContent}
    <div
        class="fixed z-[9999] pointer-events-none"
        style="left: {x}px; top: {y + 20}px;"
    >
        <div
            class="px-3 py-2 rounded shadow-2xl border text-xs whitespace-pre-line max-w-md"
            style="
                background-color: var(--bg-header);
                border-color: var(--border-light);
                color: var(--fg-default);
            "
        >
            {tooltipContent}
        </div>
    </div>
{/if}
