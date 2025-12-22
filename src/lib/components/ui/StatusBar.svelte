<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorMetrics } from "$lib/stores/editorMetrics.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { TextWrap } from "lucide-svelte";

    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));

    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");

    let textOpacity = $derived(1 - appState.statusBarTransparency / 100);

    let fileSizeDisplay = $derived.by(() => {
        const bytes = activeTab?.sizeBytes || 0;
        const kb = bytes / 1024;
        if (kb < 100) {
            return kb.toFixed(1);
        }
        return Math.round(kb).toString();
    });

    let fileType = $derived.by(() => {
        if (!activeTab) return "markdown";
        const path = activeTab.path || activeTab.title || "";
        if (path.endsWith(".txt")) return "text";
        if (path.endsWith(".md")) return "markdown";
        return "markdown";
    });

    function toggleLineEnding() {
        if (activeTab) {
            const index = editorStore.tabs.findIndex((t) => t.id === activeTab!.id);
            if (index !== -1) {
                const newTabs = [...editorStore.tabs];
                newTabs[index] = {
                    ...newTabs[index],
                    lineEnding: newTabs[index].lineEnding === "LF" ? "CRLF" : "LF",
                };
                editorStore.tabs = newTabs;
                editorStore.sessionDirty = true;
            }
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
        background-color: color-mix(in srgb, var(--color-bg-panel), transparent {appState.statusBarTransparency}%);
        border-color: var(--color-border-main);
    "
>
    <div class="flex gap-4 items-center flex-shrink-0 status-bar-section pointer-events-auto" style="opacity: {textOpacity}; color: var(--color-fg-muted);">
        <span class="metric-item min-w-[70px]" use:tooltip={"File Type"}>{fileType}</span>
        <span class="metric-divider">|</span>

        <div class="flex gap-1 items-center" use:tooltip={"Line Position"}>
            <span class="opacity-70">Ln</span>
            <span class="font-mono text-right inline-block w-[4ch]">{editorMetrics.cursorLine}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[4ch]">{editorMetrics.lineCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Column Position"}>
            <span class="opacity-70">Col</span>
            <span class="font-mono text-right inline-block w-[3ch]">{editorMetrics.cursorCol}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[3ch]">{editorMetrics.currentLineLength}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Character Count"}>
            <span class="opacity-70">Char</span>
            <span class="font-mono text-right inline-block w-[6ch]">{editorMetrics.cursorOffset}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[6ch]">{editorMetrics.charCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Word Position"}>
            <span class="opacity-70">Word</span>
            <span class="font-mono text-right inline-block w-[5ch]">{editorMetrics.currentWordIndex}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[5ch]">{editorMetrics.wordCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"File Size"}>
            <span class="font-mono text-right inline-block w-[5ch]">{fileSizeDisplay}</span>
            <span class="opacity-70 uppercase">kb</span>
        </div>
    </div>

    <div class="flex gap-4 items-center flex-shrink-0 status-bar-section pointer-events-auto" style="opacity: {textOpacity}; color: var(--color-fg-muted);">
        <button class="hover:text-[var(--color-fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleLineEnding} use:tooltip={"Toggle Line Ending"}>
            {lineEnding}
        </button>

        <span class="px-1 cursor-default opacity-70" use:tooltip={"File Encoding"}>
            {encoding}
        </span>

        <span class="font-bold w-8 text-center" style="color: {editorMetrics.insertMode === 'OVR' ? 'var(--color-danger)' : 'var(--color-accent-secondary)'}">
            {editorMetrics.insertMode}
        </span>

        <button class="flex items-center gap-1 hover:text-[var(--color-fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleWordWrap} use:tooltip={"Toggle Word Wrap"} style="color: {appState.editorWordWrap ? 'var(--color-accent-secondary)' : 'inherit'};">
            <TextWrap size={14} />
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
        background-color: var(--color-bg-panel) !important;
    }

    .status-bar:hover .status-bar-section {
        opacity: 1 !important;
    }

    button {
        pointer-events: auto;
    }

    .metric-divider {
        opacity: 0.4;
    }
</style>
