<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";

    let m = $derived(editorStore.activeMetrics);

    // Derive active tab data and index
    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === appState.activeTabId) + 1);
    let displayPath = $derived(activeTab?.customTitle || activeTab?.path || activeTab?.title || "Untitled");

    // Timestamp
    let timestamp = $derived(activeTab?.modified || activeTab?.created || "");

    // Calculate base opacity: 1 - (transparency / 100).
    let baseOpacity = $derived(1 - appState.statusBarTransparency / 100);
</script>

<footer
    class="h-6 border-t flex items-center px-3 text-xs select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden transition-opacity duration-200 group status-bar"
    style="
        background-color: var(--bg-panel);
        border-color: var(--border-main);
        color: var(--fg-muted);
        --sb-opacity: {baseOpacity};
    "
>
    <!-- Left: File Path (Accent Color) -->
    <div class="flex gap-4 overflow-hidden mr-4">
        <span class="truncate max-w-[40vw] font-bold" style="color: var(--accent-primary)" title={displayPath}>
            <span style="color: var(--fg-muted); font-weight: normal;">{tabIndex}:&nbsp;</span>{displayPath}
        </span>
        <!-- Timestamp (No Label) -->
        {#if timestamp}
            <span class="hidden md:inline opacity-70" title="Timestamp" style="color: var(--fg-muted)">{timestamp}</span>
        {/if}
    </div>

    <!-- Right: Metrics -->
    <div class="flex gap-4 items-center flex-shrink-0">
        <!-- Chars: x / y -->
        <span title="Position / Total Characters">{m.cursorOffset} / {m.charCount} chars</span>

        <!-- Word Count -->
        <span>{m.wordCount} words</span>

        <span class="hidden sm:inline">{m.sizeKB.toFixed(2)} KB</span>
        <span class="hidden sm:inline">Ln {m.cursorLine}, Col {m.cursorCol}</span>

        <!-- Insert Mode Indicator -->
        <span class="font-bold w-8 text-center" style="color: {m.insertMode === 'OVR' ? 'var(--danger)' : 'var(--accent-secondary)'}">
            {m.insertMode}
        </span>
    </div>
</footer>

<style>
    .status-bar {
        opacity: var(--sb-opacity);
    }
    .status-bar:hover {
        opacity: 1 !important;
    }
</style>
