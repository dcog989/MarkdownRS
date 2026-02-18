<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
    import { toggleInsertMode } from '$lib/stores/editorMetrics.svelte';
    import { togglePreferredExtension, updateLineEnding } from '$lib/stores/editorStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { formatFileSize, isMarkdownFile } from '$lib/utils/fileValidation';
    import { saveSettings } from '$lib/utils/settings';
    import { formatNumber } from '$lib/utils/textMetrics';
    import { ClipboardCopy, TextWrap } from 'lucide-svelte';

    let activeTab = $derived(
        appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId),
    );

    // Reactive totals pulled directly from pre-calculated state in the tab
    let lineEnding = $derived(activeTab?.lineEnding || 'LF');
    let encoding = $derived(activeTab?.encoding || 'UTF-8');
    let sizeBytes = $derived(activeTab?.sizeBytes || 0);
    let totalWords = $derived(activeTab?.wordCount || 0);
    let wordCountPending = $derived(activeTab?.wordCountPending || false);
    let totalChars = $derived(activeTab?.content.length || 0);
    let totalLines = $derived(activeTab?.lineCount || 1);
    let widestColumn = $derived(activeTab?.widestColumn || 0);

    let preferredExtension = $derived(activeTab?.preferredExtension);
    let path = $derived(activeTab?.path);
    let tabId = $derived(activeTab?.id);

    let textOpacity = $derived(1 - appContext.app.statusBarTransparency / 100);
    let fileSizeDisplay = $derived(formatFileSize(sizeBytes));

    let fileType = $derived.by(() => {
        if (!tabId) return 'markdown';
        if (preferredExtension) return preferredExtension === 'txt' ? 'text' : 'markdown';
        if (path) return isMarkdownFile(path) ? 'markdown' : 'text';
        return 'markdown';
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
            const next = lineEnding === 'LF' ? 'CRLF' : 'LF';
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
            `File Path: ${activeTab.path || 'Unsaved'}`,
            `File Size: ${preciseSize} (${sizeBytes.toLocaleString()} bytes)`,
            `Total Lines: ${totalLines.toLocaleString()}`,
            `Widest Column: ${widestColumn.toLocaleString()}`,
            `Total Characters: ${totalChars.toLocaleString()}`,
            `Total Words: ${totalWords.toLocaleString()}`,
            `Line Ending: ${lineEnding}`,
            `Encoding: ${encoding}`,
        ].join('\n');

        await navigator.clipboard.writeText(stats);
        showMenu = false;
    }
</script>

<footer
    class="text-ui-sm bg-bg-panel bg-border-main hover:bg-bg-panel! group pointer-events-auto z-50 flex h-6 shrink-0 items-center justify-between overflow-hidden border-t px-3 py-3 whitespace-nowrap transition-colors duration-200 select-none"
    style="
        background-color: color-mix(in srgb, var(--color-bg-panel), transparent {appContext.app
        .statusBarTransparency}%);
    "
    oncontextmenu={handleContextMenu}>
    <div
        class="text-fg-muted pointer-events-auto flex shrink-0 items-center gap-4 transition-opacity duration-200 group-hover:opacity-100"
        style="opacity: {textOpacity};">
        {#if canToggleFileType}
            <button
                class="text-accent-primary hover:text-accent-secondary hover-surface min-w-17.5 cursor-pointer rounded px-1 transition-colors"
                onclick={toggleFileType}
                use:tooltip={'Toggle File Type (markdown/text)'}>
                {fileType}
            </button>
        {:else}
            <span class="min-w-17.5 cursor-default" use:tooltip={'File Type'}>{fileType}</span>
        {/if}
        <span class="opacity-40">|</span>

        <div class="flex items-center gap-1" use:tooltip={'Line Position'}>
            <span class="opacity-70">Ln</span>
            <span class="inline-block min-w-[4ch] text-right font-mono"
                >{formatNumber(appContext.metrics.cursorLine)}</span>
            <span class="opacity-30">/</span>
            <span class="inline-block min-w-[4ch] text-left font-mono"
                >{formatNumber(totalLines)}</span>
        </div>

        <div class="flex items-center gap-1" use:tooltip={'Column Position'}>
            <span class="opacity-70">Col</span>
            <span class="inline-block min-w-[3ch] text-right font-mono"
                >{formatNumber(appContext.metrics.cursorCol)}</span>
            <span class="opacity-30">/</span>
            <span class="inline-block min-w-[3ch] text-left font-mono">
                {formatNumber(
                    Math.max(
                        appContext.metrics.currentLineLength,
                        appContext.metrics.cursorCol > appContext.metrics.currentLineLength
                            ? appContext.metrics.cursorCol
                            : appContext.metrics.currentLineLength,
                    ),
                )}
            </span>
        </div>

        <div class="flex items-center gap-1" use:tooltip={'Character Position'}>
            <span class="opacity-70">Char</span>
            <span class="inline-block min-w-[5ch] text-right font-mono"
                >{formatNumber(appContext.metrics.cursorOffset)}</span>
            <span class="opacity-30">/</span>
            <span class="inline-block min-w-[5ch] text-left font-mono"
                >{formatNumber(totalChars)}</span>
        </div>

        <div class="flex items-center gap-1" use:tooltip={'Word Position'}>
            <span class="opacity-70">Word</span>
            <span class="inline-block min-w-[4ch] text-right font-mono"
                >{formatNumber(appContext.metrics.currentWordIndex)}</span>
            <span class="opacity-30">/</span>
            <span
                class="inline-block min-w-[4ch] text-left font-mono {wordCountPending
                    ? 'opacity-50'
                    : ''}">{formatNumber(totalWords)}</span>
        </div>

        <div class="ml-2 flex items-center gap-1" use:tooltip={'File Size'}>
            <span class="inline-block min-w-[7ch] text-right font-mono">{fileSizeDisplay}</span>
        </div>
    </div>

    <div
        class="text-fg-muted pointer-events-auto flex shrink-0 items-center gap-4 transition-opacity duration-200 group-hover:opacity-100"
        style="opacity: {textOpacity};">
        <button
            class="hover:text-fg-default hover-surface cursor-pointer rounded px-1 transition-colors"
            onclick={toggleLineEnding}
            use:tooltip={'Toggle Line Ending'}>
            {lineEnding}
        </button>

        <span class="cursor-default px-1 opacity-70" use:tooltip={'File Encoding'}>
            {encoding}
        </span>

        <button
            onclick={toggleInsertMode}
            class="w-8 text-center font-bold {appContext.metrics.insertMode === 'OVR'
                ? 'text-danger'
                : 'text-accent-secondary'}">
            {appContext.metrics.insertMode}
        </button>

        <button
            class="hover:text-fg-default hover-surface flex cursor-pointer items-center gap-1 rounded px-1 transition-colors {appContext
                .app.editorWordWrap
                ? 'text-accent-secondary'
                : 'text-inherit'}"
            onclick={toggleWordWrap}
            use:tooltip={'Toggle Word Wrap'}>
            <TextWrap size={14} />
        </button>
    </div>
</footer>

{#if showMenu}
    <ContextMenu x={menuX} y={menuY} onClose={() => (showMenu = false)}>
        <button
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={copyAllStats}>
            <ClipboardCopy size={14} class="opacity-70" />
            <span>Copy all document stats</span>
        </button>
    </ContextMenu>
{/if}
