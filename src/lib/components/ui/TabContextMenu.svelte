<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { exportService } from "$lib/services/exportService";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { bookmarkStore } from "$lib/stores/bookmarkStore.svelte.ts";
    import { editorStore, type EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { callBackend } from "$lib/utils/backend";
    import { requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem";
    import { save } from "@tauri-apps/plugin-dialog";
    import { ArrowLeft, ArrowRight, Bookmark, BookmarkX, Copy, Download, FileDown, FilePen, Files, Pin, PinOff, Save, Trash2, Undo2, X } from "lucide-svelte";
    import { tick } from "svelte";

    let { tabId, x, y, onClose } = $props<{
        tabId: string;
        x: number;
        y: number;
        onClose: () => void;
    }>();

    let showCloseSubmenu = $state(false);
    let showExportSubmenu = $state(false);
    let showRestoreSubmenu = $state(false);

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let isPinned = $derived(tab?.isPinned || false);
    let isBookmarked = $derived(tab?.path ? bookmarkStore.isBookmarked(tab.path) : false);
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === tabId));

    // Functional State for disabling menu items
    let hasTabsToRight = $derived(tabIndex < editorStore.tabs.length - 1);
    let hasTabsToLeft = $derived(tabIndex > 0);
    let hasOtherTabs = $derived(editorStore.tabs.length > 1);
    let hasSavedTabs = $derived(editorStore.tabs.some((t) => !t.isDirty && t.id !== tabId));
    let hasUnsavedTabs = $derived(editorStore.tabs.some((t) => t.isDirty && t.id !== tabId));
    let hasCloseableTabsToRight = $derived(tabIndex < editorStore.tabs.length - 1 && editorStore.tabs.slice(tabIndex + 1).some((t) => !t.isPinned));
    let hasCloseableTabsToLeft = $derived(tabIndex > 0 && editorStore.tabs.slice(0, tabIndex).some((t) => !t.isPinned));
    let hasCloseableOtherTabs = $derived(editorStore.tabs.some((t) => t.id !== tabId && !t.isPinned));

    async function handleSave() {
        const prevActive = appState.activeTabId;
        appState.activeTabId = tabId;
        await saveCurrentFile();
        appState.activeTabId = prevActive;
        onClose();
    }

    async function handleSaveAs() {
        if (!tab) return;
        const prevActive = appState.activeTabId;
        appState.activeTabId = tabId;

        try {
            const savePath = await save({
                filters: [{ name: "Markdown", extensions: ["md"] }],
            });

            if (savePath) {
                const sanitizedPath = savePath.replace(/\0/g, "").replace(/\\/g, "/");
                await callBackend("write_text_file", { path: sanitizedPath, content: tab.content }, "File:Write");
                const fileName = sanitizedPath.split(/[\\/]/).pop() || "Untitled";
                editorStore.updateTabPath(tabId, sanitizedPath, fileName);
                editorStore.markAsSaved(tabId);
            }
        } finally {
            appState.activeTabId = prevActive;
            onClose();
        }
    }

    function handlePin() {
        if (!tab) return;
        editorStore.togglePin(tabId);
        onClose();
    }

    async function handleCloseMany(mode: "right" | "left" | "others" | "saved" | "unsaved" | "all") {
        let targets: typeof editorStore.tabs = [];

        if (mode === "right") targets = editorStore.tabs.slice(tabIndex + 1);
        else if (mode === "left") targets = editorStore.tabs.slice(0, tabIndex);
        else if (mode === "others") targets = editorStore.tabs.filter((t) => t.id !== tabId);
        else if (mode === "saved") targets = editorStore.tabs.filter((t) => !t.isDirty && t.id !== tabId);
        else if (mode === "unsaved") targets = editorStore.tabs.filter((t) => t.isDirty && t.id !== tabId);
        else if (mode === "all") targets = editorStore.tabs;

        // Sequence closing to ensure dialogs/state don't race
        for (const t of targets.filter((t) => !t.isPinned)) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    function handleRename() {
        if (!tab) return;
        const newTitle = prompt("Enter new title:", tab.customTitle || tab.title);
        if (newTitle && newTitle.trim()) {
            editorStore.updateTabTitle(tabId, newTitle.trim(), newTitle.trim());
        }
        onClose();
    }

    async function handleSendToRecycleBin() {
        if (!tab || !tab.path) return;

        const confirmed = confirm(`Are you sure you want to send "${tab.title}" to the Recycle Bin?`);
        if (!confirmed) {
            onClose();
            return;
        }

        try {
            await callBackend("send_to_recycle_bin", { path: tab.path }, "File:Write");
            editorStore.closeTab(tabId);
        } catch (err) {
            // Error logged by bridge
        }
        onClose();
    }

    async function handleToggleBookmark() {
        if (!tab || !tab.path) return;
        try {
            if (isBookmarked) {
                const bookmark = bookmarkStore.getBookmark(tab.path);
                if (bookmark) await bookmarkStore.deleteBookmark(bookmark.id);
            } else {
                await bookmarkStore.addBookmark(tab.path, tab.title, []);
            }
        } finally {
            onClose();
        }
    }

    function getHistoryTooltip(tab: EditorTab): string {
        const lines = tab.content.slice(0, 300).split("\n").slice(0, 5);
        const preview = lines.join("\n") + (tab.content.length > 300 ? "..." : "");

        let title = tab.title;
        if (tab.path) {
            title += `\n${tab.path}`;
        }

        return `${title}\n\n-- Preview --\n${preview}`;
    }

    function formatTitle(title: string): string {
        if (title.length > 20) {
            return title.substring(0, 20) + "...";
        }
        return title;
    }
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide })}
        <!-- File Operations -->
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSave}>
            <Save size={14} class="opacity-70" /><span>Save</span>
        </button>
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSaveAs}>
            <FileDown size={14} class="opacity-70" /><span>Save As...</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <!-- Meta Operations -->
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handlePin}>
            {#if isPinned}
                <PinOff size={14} class="opacity-70" /><span>Unpin</span>
            {:else}
                <Pin size={14} class="opacity-70" /><span>Pin</span>
            {/if}
        </button>

        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" disabled={!tab?.path} onclick={handleToggleBookmark}>
            {#if isBookmarked}
                <BookmarkX size={14} class="opacity-70" /><span>Remove Bookmark</span>
            {:else}
                <Bookmark size={14} class="opacity-70" /><span>Add Bookmark</span>
            {/if}
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <Submenu bind:show={showExportSubmenu} side={submenuSide}>
            {#snippet trigger()}
                <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center">
                    <Download size={14} class="mr-2 opacity-70" />
                    <span>Export</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appState.activeTabId !== tabId) appState.activeTabId = tabId;
                    await exportService.exportToHtml();
                    onClose();
                }}>Export to HTML</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appState.activeTabId !== tabId) appState.activeTabId = tabId;
                    await exportService.exportToPdf();
                    onClose();
                }}>Export to PDF</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appState.activeTabId !== tabId) appState.activeTabId = tabId;
                    await exportService.exportToImage("png");
                    onClose();
                }}>Export to PNG</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appState.activeTabId !== tabId) appState.activeTabId = tabId;
                    await exportService.exportToImage("webp");
                    onClose();
                }}>Export to WEBP</button
            >
        </Submenu>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <!-- Tab Position Operations -->
        <button
            type="button"
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={tabIndex === 0}
            onclick={async () => {
                const newTabs = [...editorStore.tabs];
                const [tab] = newTabs.splice(tabIndex, 1);
                newTabs.unshift(tab);
                editorStore.reorderTabs(newTabs);
                editorStore.sessionDirty = true;
                appState.activeTabId = tabId;
                editorStore.pushToMru(tabId);
                await tick();
                // Force scroll after DOM update
                const event = new CustomEvent("scroll-to-active-tab");
                window.dispatchEvent(event);
                onClose();
            }}
        >
            <ArrowLeft size={14} class="opacity-70" /><span>Move to Start</span>
        </button>
        <button
            type="button"
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={tabIndex === editorStore.tabs.length - 1}
            onclick={async () => {
                const newTabs = [...editorStore.tabs];
                const [tab] = newTabs.splice(tabIndex, 1);
                newTabs.push(tab);
                editorStore.reorderTabs(newTabs);
                editorStore.sessionDirty = true;
                appState.activeTabId = tabId;
                editorStore.pushToMru(tabId);
                await tick();
                // Force scroll after DOM update
                const event = new CustomEvent("scroll-to-active-tab");
                window.dispatchEvent(event);
                onClose();
            }}
        >
            <ArrowRight size={14} class="opacity-70" /><span>Move to End</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <!-- Closure Operations -->
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" disabled={isPinned} onclick={() => requestCloseTab(tabId)}>
            <X size={14} class="opacity-70" /><span>Close</span>
        </button>

        <Submenu bind:show={showCloseSubmenu} side={submenuSide}>
            {#snippet trigger()}
                <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center">
                    <Files size={14} class="mr-2 opacity-70" />
                    <span>Close Many</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" disabled={!hasCloseableTabsToRight} onclick={() => handleCloseMany("right")}>Close to the Right</button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" disabled={!hasCloseableTabsToLeft} onclick={() => handleCloseMany("left")}>Close to the Left</button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" disabled={!hasCloseableOtherTabs} onclick={() => handleCloseMany("others")}>Close Others</button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" disabled={!hasSavedTabs} onclick={() => handleCloseMany("saved")}>Close Saved</button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" disabled={!hasUnsavedTabs} onclick={() => handleCloseMany("unsaved")}>Close Not Saved</button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("all")}>Close All</button>
        </Submenu>

        <Submenu bind:show={showRestoreSubmenu} side={submenuSide}>
            {#snippet trigger()}
                <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center {editorStore.closedTabsHistory.length === 0 ? 'opacity-50' : ''}">
                    <Undo2 size={14} class="mr-2 opacity-70" />
                    <span>Reopen Tabs</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            {#if editorStore.closedTabsHistory.length > 0}
                <div class="px-3 py-1.5 text-xs opacity-50 font-semibold border-b border-[var(--color-border-main)]">RECENTLY CLOSED</div>
                {#each editorStore.closedTabsHistory as item, i}
                    <button
                        type="button"
                        class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center justify-between"
                        use:tooltip={getHistoryTooltip(item.tab)}
                        onclick={() => {
                            const reopenedTabId = editorStore.reopenClosedTab(i);
                            if (reopenedTabId) {
                                appState.activeTabId = reopenedTabId;
                            }
                            onClose();
                        }}
                    >
                        <span>{formatTitle(item.tab.customTitle || item.tab.title)}</span>
                    </button>
                {/each}
            {:else}
                <div class="px-3 py-2 text-sm text-[var(--color-fg-muted)]">History empty</div>
            {/if}
        </Submenu>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <!-- Path/Name Operations -->
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleRename}>
            <FilePen size={14} class="opacity-70" /><span>Rename</span>
        </button>
        <button
            type="button"
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            onclick={() => {
                navigator.clipboard.writeText(tab!.title);
                onClose();
            }}
        >
            <Copy size={14} class="opacity-70" /><span>Copy File Name</span>
        </button>
        <button
            type="button"
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={!tab?.path}
            onclick={() => {
                navigator.clipboard.writeText(tab!.path!);
                onClose();
            }}
        >
            <Copy size={14} class="opacity-70" /><span>Copy Full Path</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <!-- Destruction -->
        <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" style="color: var(--color-danger-text)" disabled={!tab?.path || isPinned} onclick={handleSendToRecycleBin}>
            <Trash2 size={14} /><span>Delete to Recycle Bin</span>
        </button>
    {/snippet}
</ContextMenu>

<style>
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
</style>
