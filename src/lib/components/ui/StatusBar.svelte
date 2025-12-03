<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
</script>

<footer class="h-6 border-t flex items-center px-3 text-xs select-none justify-between shrink-0 z-50" style="background-color: var(--bg-panel); border-color: var(--border-main); color: var(--fg-muted);">
    <div class="flex gap-4">
        <span style="color: var(--accent-link)">{appState.activeTabId ? "Markdown" : "Ready"}</span>
    </div>
    <div class="flex gap-4 items-center">
        <span>Ln 1, Col 1</span>
        <span>UTF-8</span>
    </div>
</footer>
