<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
</script>

<!-- Status Bar: Default theme color, no accent background -->
<footer class="h-6 bg-[#252526] border-t border-[#1e1e1e] text-gray-400 flex items-center px-3 text-xs select-none justify-between shrink-0 z-50">
    <div class="flex gap-4">
        <span class="text-[#3794ff]">{appState.activeTabId ? "Markdown" : "Ready"}</span>
    </div>
    <div class="flex gap-4 items-center">
        <span>Ln 1, Col 1</span>
        <span>UTF-8</span>
    </div>
</footer>
