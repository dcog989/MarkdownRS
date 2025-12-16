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
        <span use:tooltip={"Cursor Position / Total Characters"}>{m.cursorOffset} / {m.charCount} chars</span>
        <span>{m.wordCount} words</span>
        <span class="hidden sm:inline">{m.sizeKB.toFixed(2)} KB</span>
        <span class="hidden sm:inline">Ln {m.cursorLine}, Col {m.cursorCol}</span>
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
</style>
