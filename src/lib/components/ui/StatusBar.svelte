<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { toggleInsertMode } from "$lib/stores/editorMetrics.svelte";
    import { togglePreferredExtension, updateLineEnding } from "$lib/stores/editorStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { saveSettings } from "$lib/utils/settings";
    import { TextWrap } from "lucide-svelte";

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));

    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");

    let textOpacity = $derived(1 - appContext.app.statusBarTransparency / 100);

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

        if (activeTab.preferredExtension) {
            return activeTab.preferredExtension === "txt" ? "text" : "markdown";
        }

        if (activeTab.path) {
            return isMarkdownFile(activeTab.path) ? "markdown" : "text";
        }

        return "markdown";
    });

    let canToggleFileType = $derived(!!activeTab);

    function toggleFileType() {
        if (activeTab) {
            togglePreferredExtension(activeTab.id);
        }
    }

    function toggleLineEnding() {
        if (activeTab) {
            const next = activeTab.lineEnding === "LF" ? "CRLF" : "LF";
            updateLineEnding(activeTab.id, next);
        }
    }

    function toggleWordWrap() {
        appContext.app.editorWordWrap = !appContext.app.editorWordWrap;
        saveSettings();
    }
</script>

<footer
    class="h-6 border-t flex items-center px-3 text-ui-sm select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden bg-bg-panel border-border-main pointer-events-auto transition-colors duration-200 hover:!bg-bg-panel group"
    style="
        background-color: color-mix(in srgb, var(--color-bg-panel), transparent {appContext.app.statusBarTransparency}%);
    "
>
    <div class="flex gap-4 items-center flex-shrink-0 pointer-events-auto text-fg-muted transition-opacity duration-200 group-hover:opacity-100" style="opacity: {textOpacity};">
        {#if canToggleFileType}
            <button class="min-w-[70px] hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleFileType} use:tooltip={"Toggle File Type (markdown/text)"}>
                {fileType}
            </button>
        {:else}
            <span class="min-w-[70px] cursor-default" use:tooltip={"File Type"}>{fileType}</span>
        {/if}
        <span class="opacity-40">|</span>

        <div class="flex gap-1 items-center" use:tooltip={"Line Position"}>
            <span class="opacity-70">Ln</span>
            <span class="font-mono text-right inline-block w-[4ch]">{appContext.metrics.cursorLine}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[4ch]">{appContext.metrics.lineCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Column Position"}>
            <span class="opacity-70">Col</span>
            <span class="font-mono text-right inline-block w-[3ch]">{appContext.metrics.cursorCol}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[3ch]">
                {Math.max(appContext.metrics.currentLineLength, appContext.metrics.cursorCol > appContext.metrics.currentLineLength ? appContext.metrics.cursorCol : appContext.metrics.currentLineLength)}
            </span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Character Count"}>
            <span class="opacity-70">Char</span>
            <span class="font-mono text-right inline-block w-[6ch]">{appContext.metrics.cursorOffset}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[6ch]">{appContext.metrics.charCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Word Position"}>
            <span class="opacity-70">Word</span>
            <span class="font-mono text-right inline-block w-[5ch]">{appContext.metrics.currentWordIndex}</span>
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block w-[5ch]">{appContext.metrics.wordCount}</span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"File Size"}>
            <span class="font-mono text-right inline-block w-[5ch]">{fileSizeDisplay}</span>
            <span class="opacity-70 uppercase">kb</span>
        </div>
    </div>

    <div class="flex gap-4 items-center flex-shrink-0 pointer-events-auto text-fg-muted transition-opacity duration-200 group-hover:opacity-100" style="opacity: {textOpacity};">
        <button class="hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors" onclick={toggleLineEnding} use:tooltip={"Toggle Line Ending"}>
            {lineEnding}
        </button>

        <span class="px-1 cursor-default opacity-70" use:tooltip={"File Encoding"}>
            {encoding}
        </span>

        <button onclick={toggleInsertMode} class="font-bold w-8 text-center {appContext.metrics.insertMode === 'OVR' ? 'text-danger' : 'text-accent-secondary'}">
            {appContext.metrics.insertMode}
        </button>

        <button class="flex items-center gap-1 hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors {appContext.app.editorWordWrap ? 'text-accent-secondary' : 'text-inherit'}" onclick={toggleWordWrap} use:tooltip={"Toggle Word Wrap"}>
            <TextWrap size={14} />
        </button>
    </div>
</footer>
