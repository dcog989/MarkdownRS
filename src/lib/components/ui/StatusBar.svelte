<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";

    let m = $derived(editorStore.activeMetrics);
</script>

<footer class="h-6 border-t flex items-center px-3 text-xs select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden" style="background-color: var(--bg-panel); border-color: var(--border-main); color: var(--fg-muted);">
    <!-- Left: Status / Language -->
    <div class="flex gap-4">
        <span style="color: var(--accent-link)">{appState.activeTabId ? "Markdown" : "Ready"}</span>
    </div>

    <!-- Right: Metrics -->
    <div class="flex gap-4 items-center">
        <span>{m.sizeKB.toFixed(2)} KB</span>
        <span class="hidden sm:inline">{m.wordCount} words</span>
        <span>Ln {m.cursorLine}, Col {m.cursorCol}</span>
        <span class="hidden sm:inline">UTF-8 LF</span>
        <span>{m.insertMode}</span>
    </div>
</footer>
