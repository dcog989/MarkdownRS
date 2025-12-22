<script lang="ts">
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Submenu from "$lib/components/ui/Submenu.svelte";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { bookmarkStore } from "$lib/stores/bookmarkStore.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem";
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { Bookmark, BookmarkX, Copy, FileDown, FileEdit, Files, Pin, PinOff, Save, Trash2, Undo2 } from "lucide-svelte";

    let { tabId, x, y, onClose } = $props<{ tabId: string; x: number; y: number; onClose: () => void }>();

    let showCloseSubmenu = $state(false);
    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let isPinned = $derived(tab?.isPinned || false);
    let isBookmarked = $derived(tab?.path ? bookmarkStore.isBookmarked(tab.path) : false);
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === tabId));

    async function handleSave() {
        const prev = appState.activeTabId;
        appState.activeTabId = tabId;
        await saveCurrentFile();
        appState.activeTabId = prev;
        onClose();
    }

    async function handleSaveAs() {
        if (!tab) return;
        const prev = appState.activeTabId;
        appState.activeTabId = tabId;
        try {
            const savePath = await save({ filters: [{ name: "Markdown", extensions: ["md"] }] });
            if (savePath) {
                const sanitizedPath = savePath.replace(/\0/g, "").replace(/\\/g, "/");
                await invoke("write_text_file", { path: sanitizedPath, content: tab.content });
                tab.path = sanitizedPath;
                tab.title = sanitizedPath.split(/[\\/]/).pop() || "Untitled";
                tab.isDirty = false;
            }
        } finally {
            appState.activeTabId = prev;
            onClose();
        }
    }

    async function handleCloseMany(mode: "right" | "left" | "others" | "saved" | "unsaved" | "all") {
        let targets: typeof editorStore.tabs = [];
        if (mode === "right") targets = editorStore.tabs.slice(tabIndex + 1);
        else if (mode === "left") targets = editorStore.tabs.slice(0, tabIndex);
        else if (mode === "others") targets = editorStore.tabs.filter((t) => t.id !== tabId);
        else if (mode === "saved") targets = editorStore.tabs.filter((t) => !t.isDirty && t.id !== tabId);
        else if (mode === "unsaved") targets = editorStore.tabs.filter((t) => t.isDirty && t.id !== tabId);
        else if (mode === "all") targets = editorStore.tabs;

        for (const t of targets.filter((t) => !t.isPinned)) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    function handleRename() {
        if (!tab) return;
        const n = prompt("Enter new title:", tab.customTitle || tab.title);
        if (n?.trim()) {
            tab.title = n.trim();
            tab.customTitle = n.trim();
        }
        onClose();
    }

    async function handleSendToRecycleBin() {
        if (!tab?.path || !confirm(`Delete "${tab.title}" to Recycle Bin?`)) {
            onClose();
            return;
        }
        try {
            await invoke("send_to_recycle_bin", { path: tab.path });
            editorStore.closeTab(tabId);
        } catch (err) {
            alert("Failed to delete");
        }
        onClose();
    }
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide })}
        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSave}>
            <Save size={14} class="opacity-70" /><span>Save</span>
        </button>
        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleSaveAs}>
            <FileDown size={14} class="opacity-70" /><span>Save As...</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <button
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            onclick={() => {
                tab!.isPinned = !tab!.isPinned;
                onClose();
            }}
        >
            {#if isPinned}<PinOff size={14} class="opacity-70" /><span>Unpin</span>{:else}<Pin size={14} class="opacity-70" /><span>Pin</span>{/if}
        </button>

        <button
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={!tab?.path}
            onclick={async () => {
                if (isBookmarked) {
                    const b = bookmarkStore.getBookmark(tab!.path!);
                    if (b) await bookmarkStore.deleteBookmark(b.id);
                } else await bookmarkStore.addBookmark(tab!.path!, tab!.title, []);
                onClose();
            }}
        >
            {#if isBookmarked}<BookmarkX size={14} class="opacity-70" /><span>Remove Bookmark</span>{:else}<Bookmark size={14} class="opacity-70" /><span>Add Bookmark</span>{/if}
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => requestCloseTab(tabId)}>Close</button>

        <Submenu bind:show={showCloseSubmenu} side={submenuSide}>
            {#snippet trigger()}
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center">
                    <Files size={14} class="mr-2 opacity-70" /><span>Close Many</span><span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}
            <div class="py-1">
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("right")}>Close to the Right</button>
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("left")}>Close to the Left</button>
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("others")}>Close Others</button>
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("saved")}>Close Saved</button>
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("unsaved")}>Close Not Saved</button>
                <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10" onclick={() => handleCloseMany("all")}>Close All</button>
            </div>
        </Submenu>

        <button
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={editorStore.closedTabsHistory.length === 0}
            onclick={() => {
                editorStore.reopenLastClosed();
                onClose();
            }}
        >
            <Undo2 size={14} class="opacity-70" /><span>Reopen Last Closed</span>
        </button>

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" onclick={handleRename}><FileEdit size={14} class="opacity-70" /><span>Rename</span></button>
        <button
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            onclick={() => {
                navigator.clipboard.writeText(tab!.title);
                onClose();
            }}><Copy size={14} class="opacity-70" /><span>Copy File Name</span></button
        >
        <button
            class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2"
            disabled={!tab?.path}
            onclick={() => {
                navigator.clipboard.writeText(tab!.path!);
                onClose();
            }}><Copy size={14} class="opacity-70" /><span>Copy Full Path</span></button
        >

        <div class="h-px my-1 bg-[var(--color-border-main)]"></div>

        <button class="w-full text-left px-3 py-1.5 text-ui hover:bg-white/10 flex items-center gap-2" style="color: var(--color-danger-text)" disabled={!tab?.path} onclick={handleSendToRecycleBin}><Trash2 size={14} /><span>Delete to Recycle Bin</span></button>
    {/snippet}
</ContextMenu>
