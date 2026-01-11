<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import { toggleInsertMode } from "$lib/stores/editorMetrics.svelte";
    import { togglePreferredExtension, updateLineEnding } from "$lib/stores/editorStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { formatFileSize, isMarkdownFile } from "$lib/utils/fileValidation";
    import { saveSettings } from "$lib/utils/settings";
    import { formatNumber } from "$lib/utils/textMetrics";
    import { ClipboardCopy, TextWrap } from "lucide-svelte";

    let activeTab = $derived(
        appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId)
    );

    // Reactive totals pulled directly from the tab
    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");
    let sizeBytes = $derived(activeTab?.sizeBytes || 0);
    let totalWords = $derived(activeTab?.wordCount || 0);
    let totalChars = $derived(activeTab?.content.length || 0);
    let totalLines = $derived(activeTab?.content.split("\n").length || 1);

    let widestColumn = $derived.by(() => {
        if (!activeTab?.content) return 0;
        return Math.max(...activeTab.content.split("\n").map((l) => l.length));
    });

    let preferredExtension = $derived(activeTab?.preferredExtension);
    let path = $derived(activeTab?.path);
    let tabId = $derived(activeTab?.id);

    let textOpacity = $derived(1 - appContext.app.statusBarTransparency / 100);
    let fileSizeDisplay = $derived(formatFileSize(sizeBytes));

    let fileType = $derived.by(() => {
        if (!tabId) return "markdown";
        if (preferredExtension) return preferredExtension === "txt" ? "text" : "markdown";
        if (path) return isMarkdownFile(path) ? "markdown" : "text";
        return "markdown";
    });

    let canToggleFileType = $derived(!!tabId);

    // Context Menu State
    let showMenu = $state(false);
    let menuX = $state(0);
    let menuY = $state(0);

    function toggleFileType() {
        if (tabId) togglePreferredExtension(tabId);
    }

    function toggleLineEnding() {
        if (tabId) {
            const next = lineEnding === "LF" ? "CRLF" : "LF";
            updateLineEnding(tabId, next);
        }
    }

    function toggleWordWrap() {
        appContext.app.editorWordWrap = !appContext.app.editorWordWrap;
        saveSettings();
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        menuX = e.clientX;
        menuY = e.clientY;
        showMenu = true;
    }

    async function copyAllStats() {
        if (!activeTab) return;

        const preciseSize =
            sizeBytes < 1024
                ? `${sizeBytes} B`
                : sizeBytes < 1024 * 1024
                  ? `${(sizeBytes / 1024).toFixed(2)} KB`
                  : `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

        const stats = [
            `File Path: ${activeTab.path || "Unsaved"}`,
            `File Size: ${preciseSize} (${sizeBytes.toLocaleString()} bytes)`,
            `Total Lines: ${totalLines.toLocaleString()}`,
            `Widest Column: ${widestColumn.toLocaleString()}`,
            `Total Characters: ${totalChars.toLocaleString()}`,
            `Total Words: ${totalWords.toLocaleString()}`,
            `Line Ending: ${lineEnding}`,
            `Encoding: ${encoding}`,
        ].join("\n");

        await navigator.clipboard.writeText(stats);
        showMenu = false;
    }
</script>

<footer
    class="h-6 border-t flex items-center px-3 text-ui-sm select-none justify-between shrink-0 z-50 whitespace-nowrap overflow-hidden bg-bg-panel border-border-main pointer-events-auto transition-colors duration-200 hover:!bg-bg-panel group"
    style="
        background-color: color-mix(in srgb, var(--color-bg-panel), transparent {appContext.app
        .statusBarTransparency}%);
    "
    oncontextmenu={handleContextMenu}
>
    <div
        class="flex gap-4 items-center flex-shrink-0 pointer-events-auto text-fg-muted transition-opacity duration-200 group-hover:opacity-100"
        style="opacity: {textOpacity};"
    >
        {#if canToggleFileType}
            <button
                class="min-w-[70px] hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors"
                onclick={toggleFileType}
                use:tooltip={"Toggle File Type (markdown/text)"}
            >
                {fileType}
            </button>
        {:else}
            <span class="min-w-[70px] cursor-default" use:tooltip={"File Type"}>{fileType}</span>
        {/if}
        <span class="opacity-40">|</span>

        <div class="flex gap-1 items-center" use:tooltip={"Line Position"}>
            <span class="opacity-70">Ln</span>
            <span class="font-mono text-right inline-block min-w-[4ch]"
                >{formatNumber(appContext.metrics.cursorLine)}</span
            >
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block min-w-[4ch]"
                >{formatNumber(totalLines)}</span
            >
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Column Position"}>
            <span class="opacity-70">Col</span>
            <span class="font-mono text-right inline-block min-w-[3ch]"
                >{formatNumber(appContext.metrics.cursorCol)}</span
            >
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block min-w-[3ch]">
                {formatNumber(
                    Math.max(
                        appContext.metrics.currentLineLength,
                        appContext.metrics.cursorCol > appContext.metrics.currentLineLength
                            ? appContext.metrics.cursorCol
                            : appContext.metrics.currentLineLength
                    )
                )}
            </span>
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Character Count"}>
            <span class="opacity-70">Char</span>
            <span class="font-mono text-right inline-block min-w-[5ch]"
                >{formatNumber(appContext.metrics.cursorOffset)}</span
            >
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block min-w-[5ch]"
                >{formatNumber(totalChars)}</span
            >
        </div>

        <div class="flex gap-1 items-center" use:tooltip={"Word Position"}>
            <span class="opacity-70">Word</span>
            <span class="font-mono text-right inline-block min-w-[4ch]"
                >{formatNumber(appContext.metrics.currentWordIndex)}</span
            >
            <span class="opacity-30">/</span>
            <span class="font-mono text-left inline-block min-w-[4ch]"
                >{formatNumber(totalWords)}</span
            >
        </div>

        <div class="flex gap-1 items-center ml-2" use:tooltip={"File Size"}>
            <span class="font-mono text-right inline-block min-w-[7ch]">{fileSizeDisplay}</span>
        </div>
    </div>

    <div
        class="flex gap-4 items-center flex-shrink-0 pointer-events-auto text-fg-muted transition-opacity duration-200 group-hover:opacity-100"
        style="opacity: {textOpacity};"
    >
        <button
            class="hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors"
            onclick={toggleLineEnding}
            use:tooltip={"Toggle Line Ending"}
        >
            {lineEnding}
        </button>

        <span class="px-1 cursor-default opacity-70" use:tooltip={"File Encoding"}>
            {encoding}
        </span>

        <button
            onclick={toggleInsertMode}
            class="font-bold w-8 text-center {appContext.metrics.insertMode === 'OVR'
                ? 'text-danger'
                : 'text-accent-secondary'}"
        >
            {appContext.metrics.insertMode}
        </button>

        <button
            class="flex items-center gap-1 hover:text-fg-default hover:bg-white/10 px-1 rounded cursor-pointer transition-colors {appContext
                .app.editorWordWrap
                ? 'text-accent-secondary'
                : 'text-inherit'}"
            onclick={toggleWordWrap}
            use:tooltip={"Toggle Word Wrap"}
        >
            <TextWrap size={14} />
        </button>
    </div>
</footer>

{#if showMenu}
    <ContextMenu x={menuX} y={menuY} onClose={() => (showMenu = false)}>
        {#snippet children()}
            <button
                class="w-full text-left px-3 py-1.5 text-ui flex items-center gap-2 hover:bg-white/10"
                onclick={copyAllStats}
            >
                <ClipboardCopy size={14} class="opacity-70" />
                <span>Copy all document stats</span>
            </button>
        {/snippet}
    </ContextMenu>
{/if}
