<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { message } from "@tauri-apps/plugin-dialog";

    let m = $derived(editorStore.activeMetrics);
    let showEncodingDialog = $state(false);

    // Derive active tab data and index
    let activeTab = $derived(editorStore.tabs.find((t) => t.id === appState.activeTabId));
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === appState.activeTabId) + 1);
    let displayPath = $derived(activeTab?.customTitle || activeTab?.path || activeTab?.title || "Untitled");

    // Timestamp
    let timestamp = $derived(activeTab?.modified || activeTab?.created || "");

    // Settings
    let lineEnding = $derived(activeTab?.lineEnding || "LF");
    let encoding = $derived(activeTab?.encoding || "UTF-8");

    // Calculate base opacity
    let baseOpacity = $derived(1 - appState.statusBarTransparency / 100);

    function toggleLineEnding() {
        if (activeTab) {
            activeTab.lineEnding = activeTab.lineEnding === "LF" ? "CRLF" : "LF";
            editorStore.sessionDirty = true;
        }
    }

    function handleEncodingClick() {
        showEncodingDialog = true;
    }

    function closeEncodingDialog() {
        showEncodingDialog = false;
    }

    function selectEncoding(enc: string) {
        // For now, only UTF-8 is supported for saving
        message(`${enc} encoding is displayed for information only. Files are saved as UTF-8.`, { 
            title: "Encoding", 
            kind: "info" 
        });
        showEncodingDialog = false;
    }
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

        <!-- Line Ending -->
        <button class="hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer" onclick={toggleLineEnding} title="Toggle Line Ending">
            {lineEnding}
        </button>

        <!-- Encoding -->
        <button class="hover:text-[var(--fg-default)] hover:bg-white/10 px-1 rounded cursor-pointer" onclick={handleEncodingClick} title="Encoding (UTF-8 only)">
            {encoding}
        </button>

        <!-- Insert Mode Indicator -->
        <span class="font-bold w-8 text-center" style="color: {m.insertMode === 'OVR' ? 'var(--danger)' : 'var(--accent-secondary)'}">
            {m.insertMode}
        </span>
    </div>
</footer>

<!-- Encoding Dialog -->
{#if showEncodingDialog}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="fixed inset-0 z-50 flex items-center justify-center" 
        style="background-color: var(--bg-backdrop);" 
        onclick={closeEncodingDialog}
    >
        <div 
            class="w-[400px] rounded-lg shadow-2xl border overflow-hidden" 
            style="background-color: var(--bg-panel); border-color: var(--border-light);"
            onclick={(e) => e.stopPropagation()}
        >
            <div class="p-4 border-b" style="border-color: var(--border-light);">
                <h2 class="text-lg font-semibold" style="color: var(--fg-default);">Select Encoding</h2>
            </div>
            <div class="p-2">
                {#each ['UTF-8', 'UTF-16 LE', 'UTF-16 BE', 'Windows-1252', 'ISO-8859-1'] as enc}
                    <button
                        type="button"
                        class="w-full text-left px-4 py-3 text-sm flex justify-between items-center hover:bg-white/10 rounded"
                        style="color: {enc === encoding ? 'var(--accent-secondary)' : 'var(--fg-default)'};" 
                        onclick={() => selectEncoding(enc)}
                    >
                        <span>{enc}</span>
                        {#if enc === encoding}
                            <span class="text-xs" style="color: var(--accent-secondary);">✓ Current</span>
                        {/if}
                        {#if enc !== 'UTF-8'}
                            <span class="text-xs opacity-50">(Display only)</span>
                        {/if}
                    </button>
                {/each}
            </div>
            <div class="p-4 border-t" style="border-color: var(--border-light);">
                <p class="text-xs opacity-70" style="color: var(--fg-muted);">
                    Note: Files are currently saved as UTF-8 regardless of the original encoding. Other encodings are detected and displayed for reference.
                </p>
            </div>
        </div>
    </div>
{/if}

<style>
    .status-bar {
        opacity: var(--sb-opacity);
    }
    .status-bar:hover {
        opacity: 1 !important;
    }
</style>
