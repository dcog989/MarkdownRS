<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem";
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { Pin, PinOff } from "lucide-svelte";
    import { untrack } from "svelte";

    interface Props {
        tabId: string;
        x: number;
        y: number;
        onClose: () => void;
    }

    let { tabId, x, y, onClose }: Props = $props();

    let menuEl = $state<HTMLDivElement>();
    // Use untrack to explicitly initialize with the current prop value,
    // acknowledging that subsequent prop changes are handled by the effect below.
    let adjustedX = $state(untrack(() => x));
    let adjustedY = $state(untrack(() => y));
    let submenuSide = $state<"left" | "right">("right");

    $effect(() => {
        // We depend on x and y here to update position if props change
        if (menuEl && (x || y)) {
            const rect = menuEl.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let newX = x;
            let newY = y;

            // Prevent overflowing right edge
            if (newX + rect.width > winWidth) {
                newX = winWidth - rect.width - 5;
            }
            // Prevent overflowing bottom edge
            if (newY + rect.height > winHeight) {
                newY = winHeight - rect.height - 5;
            }

            adjustedX = newX;
            adjustedY = newY;

            // Determine if submenu should open to the left
            if (newX + rect.width + 180 > winWidth) {
                submenuSide = "left";
            } else {
                submenuSide = "right";
            }
        }
    });

    let tab = $derived(editorStore.tabs.find((t) => t.id === tabId));
    let isPinned = $derived(tab?.isPinned || false);
    let tabIndex = $derived(editorStore.tabs.findIndex((t) => t.id === tabId));
    let hasTabsToRight = $derived(tabIndex < editorStore.tabs.length - 1);
    let hasTabsToLeft = $derived(tabIndex > 0);
    let hasOtherTabs = $derived(editorStore.tabs.length > 1);
    let hasSavedTabs = $derived(editorStore.tabs.some((t) => !t.isDirty && t.id !== tabId));

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
                await invoke("write_text_file", { path: sanitizedPath, content: tab.content });
                tab.path = sanitizedPath;
                tab.title = sanitizedPath.split(/[\\/]/).pop() || "Untitled";
                tab.isDirty = false;
            }
        } catch (err) {
            console.error("Failed to save file:", err);
        } finally {
            appState.activeTabId = prevActive;
            onClose();
        }
    }

    function handlePin() {
        if (!tab) return;
        tab.isPinned = !tab.isPinned;
        onClose();
    }

    function handleClose() {
        requestCloseTab(tabId);
        onClose();
    }

    function handleCloseToRight() {
        const index = tabIndex;
        const tabsToClose = editorStore.tabs.slice(index + 1).filter((t) => !t.isPinned);
        tabsToClose.forEach((t) => requestCloseTab(t.id));
        onClose();
    }

    function handleCloseToLeft() {
        const index = tabIndex;
        const tabsToClose = editorStore.tabs.slice(0, index).filter((t) => !t.isPinned);
        tabsToClose.forEach((t) => requestCloseTab(t.id));
        onClose();
    }

    function handleCloseOthers() {
        const tabsToClose = editorStore.tabs.filter((t) => t.id !== tabId && !t.isPinned);
        tabsToClose.forEach((t) => requestCloseTab(t.id));
        onClose();
    }

    function handleCloseSaved() {
        const tabsToClose = editorStore.tabs.filter((t) => !t.isDirty && t.id !== tabId && !t.isPinned);
        tabsToClose.forEach((t) => requestCloseTab(t.id));
        onClose();
    }

    function handleCloseAll() {
        const tabsToClose = editorStore.tabs.filter((t) => !t.isPinned);
        tabsToClose.forEach((t) => requestCloseTab(t.id));
        onClose();
    }

    function handleReopenLast() {
        editorStore.reopenLastClosed();
        onClose();
    }

    function handleRename() {
        if (!tab) return;
        const newTitle = prompt("Enter new title:", tab.title);
        if (newTitle && newTitle.trim()) {
            tab.title = newTitle.trim();
            tab.customTitle = newTitle.trim();
        }
        onClose();
    }

    function handleCopyFileName() {
        if (!tab) return;
        navigator.clipboard.writeText(tab.title);
        onClose();
    }

    function handleCopyFullPath() {
        if (!tab || !tab.path) return;
        navigator.clipboard.writeText(tab.path);
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
            await invoke("send_to_recycle_bin", { path: tab.path });
            editorStore.closeTab(tabId);
        } catch (err) {
            console.error("Failed to send file to recycle bin:", err);
            alert("Failed to send file to recycle bin");
        }
        onClose();
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={handleBackdropClick}>
    <div
        bind:this={menuEl}
        class="absolute w-48 rounded-md shadow-xl border py-1"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            background-color: var(--bg-panel);
            border-color: var(--border-light);
        "
    >
        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleSave}>Save</button>
        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleSaveAs}>Save As...</button>

        <div class="h-px my-1" style="background-color: var(--border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center gap-2" style="color: var(--fg-default);" onclick={handlePin}>
            {#if isPinned}
                <PinOff size={12} />
                <span>Unpin</span>
            {:else}
                <Pin size={12} />
                <span>Pin</span>
            {/if}
        </button>

        <div class="h-px my-1" style="background-color: var(--border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleClose}>Close</button>

        <div class="relative group">
            <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center justify-between" style="color: var(--fg-default);">
                <span>Close Many</span>
                <span class="text-[10px]">›</span>
            </button>

            <!-- Submenu -->
            <div
                class="absolute top-0 min-w-[180px] rounded-md shadow-xl border py-1 hidden group-hover:block"
                style="
                    background-color: var(--bg-panel);
                    border-color: var(--border-light);
                    {submenuSide === 'left' ? 'right: 100%; margin-right: 0.25rem;' : 'left: 100%; margin-left: 0.25rem;'}
                "
            >
                <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {hasTabsToRight ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={!hasTabsToRight} onclick={handleCloseToRight}>Close to the Right</button>
                <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {hasTabsToLeft ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={!hasTabsToLeft} onclick={handleCloseToLeft}>Close to the Left</button>
                <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {hasOtherTabs ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={!hasOtherTabs} onclick={handleCloseOthers}>Close Others</button>
                <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {hasSavedTabs ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={!hasSavedTabs} onclick={handleCloseSaved}>Close Saved</button>
                <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCloseAll}>Close All</button>
            </div>
        </div>

        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {editorStore.closedTabsHistory.length > 0 ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={editorStore.closedTabsHistory.length === 0} onclick={handleReopenLast}>Reopen Last Closed</button>

        <div class="h-px my-1" style="background-color: var(--border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleRename}>Rename</button>
        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: var(--fg-default);" onclick={handleCopyFileName}>Copy File Name</button>
        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {tab?.path ? 'var(--fg-default)' : 'var(--fg-muted)'};" disabled={!tab?.path} onclick={handleCopyFullPath}>Copy Full Path</button>

        <div class="h-px my-1" style="background-color: var(--border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-sm hover:bg-white/10" style="color: {tab?.path ? 'var(--danger)' : 'var(--fg-muted)'};" disabled={!tab?.path} onclick={handleSendToRecycleBin}>Delete to Recycle Bin</button>
    </div>
</div>
