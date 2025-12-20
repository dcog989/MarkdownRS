<script lang="ts">
    import Submenu from "$lib/components/ui/Submenu.svelte";
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
    let adjustedX = $state(untrack(() => x));
    let adjustedY = $state(untrack(() => y));
    let submenuSide = $state<"left" | "right">("right");
    let showCloseSubmenu = $state(false);

    $effect(() => {
        if (menuEl && (x || y)) {
            const rect = menuEl.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            let newX = x;
            let newY = y;

            if (newX + rect.width > winWidth) {
                newX = winWidth - rect.width - 5;
            }
            if (newY + rect.height > winHeight) {
                newY = winHeight - rect.height - 5;
            }

            adjustedX = newX;
            adjustedY = newY;

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
    let hasUnsavedTabs = $derived(editorStore.tabs.some((t) => t.isDirty && t.id !== tabId));

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
        const index = editorStore.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;
        
        const newTabs = [...editorStore.tabs];
        newTabs[index] = { ...newTabs[index], isPinned: !newTabs[index].isPinned };
        editorStore.tabs = newTabs;
        editorStore.sessionDirty = true;
        onClose();
    }

    function handleClose() {
        requestCloseTab(tabId);
        onClose();
    }

    async function handleCloseToRight() {
        const index = tabIndex;
        const tabsToClose = editorStore.tabs.slice(index + 1).filter((t) => !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleCloseToLeft() {
        const index = tabIndex;
        const tabsToClose = editorStore.tabs.slice(0, index).filter((t) => !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleCloseOthers() {
        const tabsToClose = editorStore.tabs.filter((t) => t.id !== tabId && !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleCloseSaved() {
        const tabsToClose = editorStore.tabs.filter((t) => !t.isDirty && t.id !== tabId && !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleCloseUnsaved() {
        const tabsToClose = editorStore.tabs.filter((t) => t.isDirty && t.id !== tabId && !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleCloseAll() {
        const tabsToClose = editorStore.tabs.filter((t) => !t.isPinned);

        // Close all in sequence to avoid race conditions
        for (const t of tabsToClose) {
            await requestCloseTab(t.id);
        }
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
<div
    class="fixed inset-0 z-50"
    onclick={handleBackdropClick}
    oncontextmenu={(e) => {
        e.preventDefault();
        onClose();
    }}
    role="dialog"
    tabindex="-1"
>
    <div
        bind:this={menuEl}
        class="absolute w-48 rounded-md shadow-xl border py-1 custom-scrollbar"
        style="
            left: {adjustedX}px;
            top: {adjustedY}px;
            background-color: var(--color-bg-panel);
            border-color: var(--color-border-light);
        "
        role="menu"
    >
        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleSave}>Save</button>
        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleSaveAs}>Save As...</button>

        <div class="h-px my-1" style="background-color: var(--color-border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10 flex items-center gap-2" style="color: var(--color-fg-default);" onclick={handlePin}>
            {#if isPinned}
                <PinOff size={12} />
                <span>Unpin</span>
            {:else}
                <Pin size={12} />
                <span>Pin</span>
            {/if}
        </button>

        <div class="h-px my-1" style="background-color: var(--color-border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleClose}>Close</button>

        <Submenu bind:show={showCloseSubmenu} side={submenuSide}>
            {#snippet trigger()}
                <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10 flex items-center" style="color: var(--color-fg-default);">
                    <span>Close Many</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {hasTabsToRight ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!hasTabsToRight} onclick={handleCloseToRight}>Close to the Right</button>
            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {hasTabsToLeft ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!hasTabsToLeft} onclick={handleCloseToLeft}>Close to the Left</button>
            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {hasOtherTabs ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!hasOtherTabs} onclick={handleCloseOthers}>Close Others</button>
            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {hasSavedTabs ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!hasSavedTabs} onclick={handleCloseSaved}>Close Saved</button>
            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {hasUnsavedTabs ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!hasUnsavedTabs} onclick={handleCloseUnsaved}>Close Not Saved</button>
            <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleCloseAll}>Close All</button>
        </Submenu>

        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {editorStore.closedTabsHistory.length > 0 ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={editorStore.closedTabsHistory.length === 0} onclick={handleReopenLast}>Reopen Last Closed</button>

        <div class="h-px my-1" style="background-color: var(--color-border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleRename}>Rename</button>
        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: var(--color-fg-default);" onclick={handleCopyFileName}>Copy File Name</button>
        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {tab?.path ? 'var(--color-fg-default)' : 'var(--color-fg-muted)'};" disabled={!tab?.path} onclick={handleCopyFullPath}>Copy Full Path</button>

        <div class="h-px my-1" style="background-color: var(--color-border-main);"></div>

        <button type="button" class="w-full text-left px-4 py-2 text-ui hover:bg-white/10" style="color: {tab?.path ? 'var(--color-danger)' : 'var(--color-fg-muted)'};" disabled={!tab?.path} onclick={handleSendToRecycleBin}>Delete to Recycle Bin</button>
    </div>
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: var(--color-border-light);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
</style>
