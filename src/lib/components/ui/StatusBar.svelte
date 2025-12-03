<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";

    let m = $derived(editorStore.activeMetrics);

    // Derive active tab data
    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));
    let displayPath = $derived(activeTab?.path || activeTab?.title || "Untitled");

    // Format Timestamps
    let created = $derived(activeTab?.created ? `C: ${activeTab.created.split(" ")[1]}` : "");
    let modified = $derived(activeTab?.modified ? `M: ${activeTab.modified.split(" ")[1]}` : "");
</script>

<footer class="h-6 border-t flex items-center px-3 text-xs select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden" style="background-color: var(--bg-panel); border-color: var(--border-main); color: var(--fg-muted);">
    <!-- Left: File Path (Accent Color) -->
    <div class="flex gap-4 overflow-hidden mr-4">
        <span class="truncate max-w-[40vw] font-medium" style="color: var(--accent-link)" title={displayPath}>
            {displayPath}
        </span>
        <!-- Timestamp Metadata -->
        {#if activeTab?.modified}
            <span class="hidden md:inline opacity-70" title="Last Modified" style="color: var(--fg-muted)">{modified}</span>
        {/if}
        {#if activeTab?.created}
            <span class="hidden lg:inline opacity-50" title="Created" style="color: var(--fg-muted)">{created}</span>
        {/if}
    </div>

    <!-- Right: Metrics -->
    <div class="flex gap-4 items-center flex-shrink-0">
        <!-- Chars: x / y -->
        <span title="Position / Total Characters">{m.cursorOffset} / {m.charCount} chars</span>

        <!-- Word Count (Restored) -->
        <span>{m.wordCount} words</span>

        <span class="hidden sm:inline">{m.sizeKB.toFixed(2)} KB</span>
        <span class="hidden sm:inline">Ln {m.cursorLine}, Col {m.cursorCol}</span>

        <!-- Insert Mode Indicator -->
        <span class="font-bold w-8 text-center" style="color: {m.insertMode === 'OVR' ? 'var(--danger)' : 'var(--accent-secondary)'}">
            {m.insertMode}
        </span>
    </div>
</footer>
