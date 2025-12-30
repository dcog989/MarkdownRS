<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { exportService } from "$lib/services/exportService";
    import { addBookmark, deleteBookmark, getBookmarkByPath, isBookmarked as isBookmarkedSelector } from "$lib/stores/bookmarkStore.svelte";
    import { markAsSaved, pushToMru, reopenClosedTab, reorderTabs, togglePin, updateTabPath, updateTabTitle } from "$lib/stores/editorStore.svelte";
    import { triggerScrollToTab } from "$lib/stores/interfaceStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
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

    let activeSubmenu = $state<"close" | "export" | "restore" | null>(null);

    let tab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let isPinned = $derived(tab?.isPinned || false);
    let isBookmarked = $derived(tab?.path ? isBookmarkedSelector(tab.path) : false);
    let tabIndex = $derived(appContext.editor.tabs.findIndex((t) => t.id === tabId));

    let hasTabsToRight = $derived(tabIndex < appContext.editor.tabs.length - 1);
    let hasTabsToLeft = $derived(tabIndex > 0);
    let hasOtherTabs = $derived(appContext.editor.tabs.length > 1);
    let hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty && t.id !== tabId));
    let hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty && t.id !== tabId));
    let hasCloseableTabsToRight = $derived(tabIndex < appContext.editor.tabs.length - 1 && appContext.editor.tabs.slice(tabIndex + 1).some((t) => !t.isPinned));
    let hasCloseableTabsToLeft = $derived(tabIndex > 0 && appContext.editor.tabs.slice(0, tabIndex).some((t) => !t.isPinned));
    let hasCloseableOtherTabs = $derived(appContext.editor.tabs.some((t) => t.id !== tabId && !t.isPinned));

    async function handleSave() {
        const prevActive = appContext.app.activeTabId;
        appContext.app.activeTabId = tabId;
        await saveCurrentFile();
        appContext.app.activeTabId = prevActive;
        onClose();
    }

    async function handleSaveAs() {
        if (!tab) return;
        const prevActive = appContext.app.activeTabId;
        appContext.app.activeTabId = tabId;

        try {
            const savePath = await save({
                filters: [{ name: "Markdown", extensions: ["md"] }],
            });

            if (savePath) {
                const sanitizedPath = savePath.replace(/\0/g, "").replace(/\\/g, "/");
                await callBackend("write_text_file", { path: sanitizedPath, content: tab.content }, "File:Write");
                const fileName = sanitizedPath.split(/[\\/]/).pop() || "Untitled";
                updateTabPath(tabId, sanitizedPath, fileName);
                markAsSaved(tabId);
            }
        } finally {
            appContext.app.activeTabId = prevActive;
            onClose();
        }
    }

    function handlePin() {
        if (!tab) return;
        togglePin(tabId);
        onClose();
    }

    async function handleCloseMany(mode: "right" | "left" | "others" | "saved" | "unsaved" | "all") {
        let targets: typeof appContext.editor.tabs = [];

        if (mode === "right") targets = appContext.editor.tabs.slice(tabIndex + 1);
        else if (mode === "left") targets = appContext.editor.tabs.slice(0, tabIndex);
        else if (mode === "others") targets = appContext.editor.tabs.filter((t) => t.id !== tabId);
        else if (mode === "saved") targets = appContext.editor.tabs.filter((t) => !t.isDirty && t.id !== tabId);
        else if (mode === "unsaved") targets = appContext.editor.tabs.filter((t) => t.isDirty && t.id !== tabId);
        else if (mode === "all") targets = appContext.editor.tabs;

        for (const t of targets.filter((t) => !t.isPinned)) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    function handleRename() {
        if (!tab) return;
        const newTitle = prompt("Enter new title:", tab.customTitle || tab.title);
        if (newTitle && newTitle.trim()) {
            updateTabTitle(tabId, newTitle.trim(), newTitle.trim());
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
            requestCloseTab(tabId);
        } catch (err) {
            // Error logged by bridge
        }
        onClose();
    }

    async function handleToggleBookmark() {
        if (!tab || !tab.path) return;
        try {
            if (isBookmarked) {
                const bookmark = getBookmarkByPath(tab.path);
                if (bookmark) await deleteBookmark(bookmark.id);
            } else {
                await addBookmark(tab.path, tab.title, []);
            }
        } finally {
            onClose();
        }
    }

    function getHistoryTooltip(tab: any): string {
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
        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSave}>
                <Save size={14} class="opacity-70" /><span>Save</span>
            </button>
            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSaveAs}>
                <FileDown size={14} class="opacity-70" /><span>Save As...</span>
            </button>

            <div class="h-px my-1 bg-border-main"></div>

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

            <div class="h-px my-1 bg-border-main"></div>
        </div>

        <Submenu
            show={activeSubmenu === "export"}
            side={submenuSide}
            onOpen={() => (activeSubmenu = "export")}
            onClose={() => {
                if (activeSubmenu === "export") activeSubmenu = null;
            }}
        >
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
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToHtml();
                    onClose();
                }}>Export to HTML</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToPdf();
                    onClose();
                }}>Export to PDF</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToImage("png");
                    onClose();
                }}>Export to PNG</button
            >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToImage("webp");
                    onClose();
                }}>Export to WEBP</button
            >
        </Submenu>

        <div class="h-px my-1 bg-border-main" onmouseenter={() => (activeSubmenu = null)} role="none"></div>

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
                disabled={tabIndex === 0}
                onclick={async () => {
                    const newTabs = [...appContext.editor.tabs];
                    const [tab] = newTabs.splice(tabIndex, 1);
                    newTabs.unshift(tab);
                    reorderTabs(newTabs);
                    appContext.editor.sessionDirty = true;
                    appContext.app.activeTabId = tabId;
                    pushToMru(tabId);
                    await tick();
                    triggerScrollToTab();
                    onClose();
                }}
            >
                <ArrowLeft size={14} class="opacity-70" /><span>Move to Start</span>
            </button>
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
                disabled={tabIndex === appContext.editor.tabs.length - 1}
                onclick={async () => {
                    const newTabs = [...appContext.editor.tabs];
                    const [tab] = newTabs.splice(tabIndex, 1);
                    newTabs.push(tab);
                    reorderTabs(newTabs);
                    appContext.editor.sessionDirty = true;
                    appContext.app.activeTabId = tabId;
                    pushToMru(tabId);
                    await tick();
                    triggerScrollToTab();
                    onClose();
                }}
            >
                <ArrowRight size={14} class="opacity-70" /><span>Move to End</span>
            </button>

            <div class="h-px my-1 bg-border-main"></div>

            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" disabled={isPinned} onclick={() => requestCloseTab(tabId)}>
                <X size={14} class="opacity-70" /><span>Close</span>
            </button>
        </div>

        <Submenu
            show={activeSubmenu === "close"}
            side={submenuSide}
            onOpen={() => (activeSubmenu = "close")}
            onClose={() => {
                if (activeSubmenu === "close") activeSubmenu = null;
            }}
        >
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

        <Submenu
            show={activeSubmenu === "restore"}
            side={submenuSide}
            onOpen={() => (activeSubmenu = "restore")}
            onClose={() => {
                if (activeSubmenu === "restore") activeSubmenu = null;
            }}
        >
            {#snippet trigger()}
                <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center {appContext.editor.closedTabsHistory.length === 0 ? 'opacity-50' : ''}">
                    <Undo2 size={14} class="mr-2 opacity-70" />
                    <span>Reopen Tabs</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            {#if appContext.editor.closedTabsHistory.length > 0}
                <div class="px-3 py-1.5 text-xs opacity-50 font-semibold border-b border-border-main">RECENTLY CLOSED</div>
                {#each appContext.editor.closedTabsHistory as item, i}
                    <button
                        type="button"
                        class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center justify-between"
                        use:tooltip={getHistoryTooltip(item.tab)}
                        onclick={() => {
                            const reopenedTabId = reopenClosedTab(i);
                            if (reopenedTabId) {
                                appContext.app.activeTabId = reopenedTabId;
                            }
                            onClose();
                        }}
                    >
                        <span>{formatTitle(item.tab.customTitle || item.tab.title)}</span>
                    </button>
                {/each}
            {:else}
                <div class="px-3 py-2 text-sm text-fg-muted">History empty</div>
            {/if}
        </Submenu>

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <div class="h-px my-1 bg-border-main"></div>

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

            <div class="h-px my-1 bg-border-main"></div>

            <button type="button" class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" style="color: var(--color-danger-text)" disabled={!tab?.path || isPinned} onclick={handleSendToRecycleBin}>
                <Trash2 size={14} /><span>Delete to Recycle Bin</span>
            </button>
        </div>
    {/snippet}
</ContextMenu>

<style>
    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
</style>
