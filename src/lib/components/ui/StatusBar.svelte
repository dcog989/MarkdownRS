<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { WrapText } from "lucide-svelte";

    let m = $derived(editorStore.activeMetrics);

    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));

    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");

    let opacity = $derived(appState.statusBarTransparency / 100);

    let bgWithAlpha = $derived(`rgba(37, 37, 38, ${1 - opacity})`);
    let textOpacity = $derived(1 - opacity);

    // Debounced metrics for display
    let displayMetrics = $state({
        lineCount: 1,
        cursorLine: 1,
        cursorCol: 1,
        charCount: 0,
        wordCount: 0,
        sizeKB: 0.0
    });

    let updateTimer: number | null = null;

    $effect(() => {
        // Trigger on metrics change
        const current = m;
        
        if (updateTimer !== null) clearTimeout(updateTimer);
        
        updateTimer = window.setTimeout(() => {
            displayMetrics = {
                lineCount: current.lineCount,
                cursorLine: current.cursorLine,
                cursorCol: current.cursorCol,
                charCount: current.charCount,
                wordCount: current.wordCount,
                sizeKB: current.sizeKB
            };
            updateTimer = null;
        }, 150);
    });

    // Format file size
    let fileSizeDisplay = $derived.by(() => {
        const kb = displayMetrics.sizeKB;
        if (kb < 100) {
            return kb.toFixed(1);
        }
        return Math.round(kb).toString();
    });

    // Get file type from tab
    let fileType = $derived.by(() => {
        if (!activeTab) return "markdown";
        const path = activeTab.path || activeTab.title || "";
        if (path.endsWith(".txt")) return "text";
        if (path.endsWith(".md")) return "markdown";
        return "markdown";
    });

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
    class="h-6 border-t flex items-center px-3 text-ui-sm select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden status-bar pointer-events-auto"
    style="
        background-color: {bgWithAlpha};
        border-color: var(--border-main);
    "
>
    <!-- Left: Metrics -->
    <div class="flex gap-4 items-center flex-shrink-0 status-bar-section pointer-events-auto" style="opacity: {textOpacity}; color: var(--fg-muted);">
        <span class="metric-item" use:tooltip={"File Type"}>{fileType}</span>
        <span class="metric-divider">|</span>
        <span class="metric-item" use:tooltip={"Line Position"}>Ln {displayMetrics.cursorLine} / {displayMetrics.lineCount}</span>
        <span class="metric-item" use:tooltip={"Column Position"}>Col {displayMetrics.cursorCol} / {displayMetrics.cursorCol}</span>
        <span class="metric-item" use:tooltip={"Character Count"}>Char {m.cursorOffset} / {displayMetrics.charCount}</span>
        <span class="metric-item" use:tooltip={"Word Count"}>Word {displayMetrics.wordCount} / {displayMetrics.wordCount}</span>
        <span class="metric-item" use:tooltip={"File Size"}>{fileSizeDisplay} KB</span>
    </div>

    <!-- Right: Technicals + Wrap -->
    <div class="flex gap-4 items-center flex-shrink-0 status-bar-section pointer-events-auto" style="opacity: {textOpacity}; color: var(--fg-muted);">
        <button class="hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleLineEnding} use:tooltip={"Toggle Line Ending"}>
            {lineEnding}
        </button>

        <span class="px-1 cursor-default opacity-70" use:tooltip={"File Encoding"}>
            {encoding}
        </span>

        <span class="font-bold w-8 text-center" style="color: {m.insertMode === 'OVR' ? 'var(--danger)' : 'var(--accent-secondary)'}">
            {m.insertMode}
        </span>

        <button class="flex items-center gap-1 hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleWordWrap} use:tooltip={"Toggle Word Wrap"} style="color: {appState.editorWordWrap ? 'var(--accent-secondary)' : 'inherit'};">
            <WrapText size={14} />
        </button>
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

    .metric-item {
        animation: fadeIn 0.3s ease-in-out;
    }

    .metric-divider {
        opacity: 0.4;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(2px);
        }
        to {
            opacity: inherit;
            transform: translateY(0);
        }
    }
</style>
