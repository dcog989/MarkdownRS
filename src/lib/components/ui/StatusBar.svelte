<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { WrapText } from "lucide-svelte";

    let m = $derived(editorStore.activeMetrics);

    // Derive active tab data and index
    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === appState.activeTabId) + 1);
    let displayPath = $derived(activeTab?.customTitle || activeTab?.path || activeTab?.title || "Untitled");

    // Timestamp
    let timestamp = $derived(activeTab?.modified || activeTab?.created || "");

    // Settings
    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");

    // Calculate opacity for both text and background
    let opacity = $derived(appState.statusBarTransparency / 100);

    // Convert --bg-panel to rgba with transparency
    // --bg-panel is #252526 (37, 37, 38) in dark mode
    let bgWithAlpha = $derived(`rgba(37, 37, 38, ${1 - opacity})`);
    let textOpacity = $derived(1 - opacity);

    function toggleLineEnding() {
        if (activeTab) {
            activeTab.lineEnding = activeTab.lineEnding === "LF" ? "CRLF" : "LF";
            editorStore.sessionDirty = true;
        }
    }

    function toggleWordWrap() {
        appState.editorWordWrap = !appState.editorWordWrap;
        saveSettings();
    }
</script>

<footer
    class="h-6 border-t flex items-center px-3 text-xs select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden status-bar pointer-events-auto"
    style="
        background-color: {bgWithAlpha};
        border-color: var(--border-main);
    "
>
    <!-- Left: File Path (Accent Color) -->
    <div class="flex gap-4 overflow-hidden mr-4 status-bar-section pointer-events-auto" style="opacity: {textOpacity};">
        <span class="truncate max-w-[40vw] font-bold" style="color: var(--accent-primary)" title={displayPath}>
            <span style="color: var(--fg-muted); font-weight: normal;">{tabIndex}:&nbsp;</span>{displayPath}
        </span>
        <!-- Timestamp (No Label) -->
        {#if timestamp}
            <span class="hidden md:inline opacity-70" title="Timestamp" style="color: var(--fg-muted)">{timestamp}</span>
        {/if}
    </div>

    <!-- Right: Metrics -->
    <div class="flex gap-4 items-center flex-shrink-0 status-bar-section pointer-events-auto" style="opacity: {textOpacity}; color: var(--fg-muted);">
        <!-- Chars: x / y -->
        <span title="Position / Total Characters">{m.cursorOffset} / {m.charCount} chars</span>

        <!-- Word Count -->
        <span>{m.wordCount} words</span>

        <span class="hidden sm:inline">{m.sizeKB.toFixed(2)} KB</span>
        <span class="hidden sm:inline">Ln {m.cursorLine}, Col {m.cursorCol}</span>

        <!-- Word Wrap Toggle -->
        <button class="flex items-center gap-1 hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleWordWrap} title="Toggle Word Wrap" style="color: {appState.editorWordWrap ? 'var(--accent-secondary)' : 'inherit'};">
            <WrapText size={14} />
        </button>

        <!-- Line Ending -->
        <button class="hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleLineEnding} title="Toggle Line Ending">
            {lineEnding}
        </button>

        <!-- Encoding (Read Only) -->
        <span class="px-1 cursor-default opacity-70" title="File Encoding">
            {encoding}
        </span>

        <!-- Insert Mode Indicator -->
        <span class="font-bold w-8 text-center" style="color: {m.insertMode === 'OVR' ? 'var(--danger)' : 'var(--accent-secondary)'}">
            {m.insertMode}
        </span>
    </div>
</footer>

<style>
    .status-bar {
        transition: background-color 200ms ease-in-out;
    }

    .status-bar-section {
        transition: opacity 200ms ease-in-out;
    }

    .status-bar:hover {
        background-color: var(--bg-panel) !important;
    }

    .status-bar:hover .status-bar-section {
        opacity: 1 !important;
    }

    button {
        pointer-events: auto;
    }
</style>
