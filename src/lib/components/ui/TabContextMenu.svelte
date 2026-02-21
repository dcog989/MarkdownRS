<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
    import Submenu from '$lib/components/ui/Submenu.svelte';
    import { exportService } from '$lib/services/exportService';
    import {
        addBookmark,
        deleteBookmark,
        getBookmarkByPath,
        isBookmarked as isBookmarkedSelector,
    } from '$lib/stores/bookmarkStore.svelte';
    import { confirmDialog } from '$lib/stores/dialogStore.svelte';
    import {
        pushToMru,
        reorderTabs,
        togglePin,
        updateTabPath,
        updateTabTitle,
    } from '$lib/stores/editorStore.svelte';
    import { triggerScrollToTab } from '$lib/stores/interfaceStore.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { shortcutManager } from '$lib/utils/shortcuts';
    import { callBackend } from '$lib/utils/backend';
    import {
        requestCloseTab,
        saveCurrentFile,
        saveCurrentFileAs,
        triggerReopenClosedTab,
        withActiveTab,
    } from '$lib/utils/fileSystem';
    import {
        ArrowLeft,
        ArrowRight,
        Bookmark,
        BookmarkX,
        Copy,
        Download,
        FileDown,
        FilePen,
        Files,
        History,
        Pin,
        PinOff,
        Save,
        Trash2,
        Undo2,
        X,
    } from 'lucide-svelte';
    import { tick } from 'svelte';

    let { tabId, x, y, onClose } = $props<{
        tabId: string;
        x: number;
        y: number;
        onClose: () => void;
    }>();

    let activeSubmenu = $state<'close' | 'export' | 'restore' | null>(null);

    let tab = $derived(appContext.editor.tabs.find((t) => t.id === tabId));
    let isPinned = $derived(tab?.isPinned || false);
    let isBookmarked = $derived(tab?.path ? isBookmarkedSelector(tab.path) : false);
    let tabIndex = $derived(appContext.editor.tabs.findIndex((t) => t.id === tabId));

    let hasSavedTabs = $derived(appContext.editor.tabs.some((t) => !t.isDirty && t.id !== tabId));
    let hasUnsavedTabs = $derived(appContext.editor.tabs.some((t) => t.isDirty && t.id !== tabId));
    let hasCloseableTabsToRight = $derived(
        tabIndex < appContext.editor.tabs.length - 1 &&
            appContext.editor.tabs.slice(tabIndex + 1).some((t) => !t.isPinned),
    );
    let hasCloseableTabsToLeft = $derived(
        tabIndex > 0 && appContext.editor.tabs.slice(0, tabIndex).some((t) => !t.isPinned),
    );
    let hasCloseableOtherTabs = $derived(
        appContext.editor.tabs.some((t) => t.id !== tabId && !t.isPinned),
    );

    async function handleSave() {
        await withActiveTab(tabId, saveCurrentFile);
        onClose();
    }

    async function handleSaveAs() {
        await withActiveTab(tabId, saveCurrentFileAs);
        onClose();
    }

    function handlePin() {
        if (!tab) return;
        togglePin(tabId);
        onClose();
    }

    async function handleCloseMany(
        mode: 'right' | 'left' | 'others' | 'saved' | 'unsaved' | 'all',
    ) {
        let targets: typeof appContext.editor.tabs = [];

        if (mode === 'right') targets = appContext.editor.tabs.slice(tabIndex + 1);
        else if (mode === 'left') targets = appContext.editor.tabs.slice(0, tabIndex);
        else if (mode === 'others') targets = appContext.editor.tabs.filter((t) => t.id !== tabId);
        else if (mode === 'saved')
            targets = appContext.editor.tabs.filter((t) => !t.isDirty && t.id !== tabId);
        else if (mode === 'unsaved')
            targets = appContext.editor.tabs.filter((t) => t.isDirty && t.id !== tabId);
        else if (mode === 'all') targets = appContext.editor.tabs;

        for (const t of targets.filter((t) => !t.isPinned)) {
            await requestCloseTab(t.id);
        }
        onClose();
    }

    async function handleRename() {
        if (!tab) return;

        // If tab has no path, just rename the tab title
        if (!tab.path) {
            const newTitle = prompt('Enter new title:', tab.customTitle || tab.title);
            if (newTitle && newTitle.trim()) {
                updateTabTitle(tabId, newTitle.trim(), newTitle.trim());
            }
            onClose();
            return;
        }

        // If tab has a path, rename the actual file
        const oldPath = tab.path; // Save the old path before any changes
        const currentFileName = oldPath.split(/[\\/]/).pop() || '';
        const currentBaseName = currentFileName.replace(/\.md$/, '');
        const newFileName = prompt('Enter new file name (without .md):', currentBaseName);

        if (!newFileName || !newFileName.trim() || newFileName.trim() === currentBaseName) {
            onClose();
            return;
        }

        const sanitizedName = newFileName.trim().replace(/[<>:"|?*]/g, '_');
        const newPath = oldPath
            .replace(/[\\/][^\\/]+$/, `/${sanitizedName}.md`)
            .replace(/\\/g, '/');

        try {
            // Import services dynamically to avoid circular dependencies
            const { fileWatcher } = await import('$lib/services/fileWatcher');
            const { invalidateMetadataCache } = await import('$lib/services/fileMetadata');

            // Unwatch the old path
            fileWatcher.unwatch(oldPath);

            // Rename the file on disk
            await callBackend('rename_file', { oldPath, newPath }, 'File:Write');

            // Invalidate metadata cache for both old and new paths
            invalidateMetadataCache(oldPath);
            invalidateMetadataCache(newPath);

            // Update the tab with the new path and title
            updateTabPath(tabId, newPath, `${sanitizedName}.md`);

            // Watch the new path
            await fileWatcher.watch(newPath);

            // Update all other tabs with the same old path
            for (const t of appContext.editor.tabs) {
                if (t.id !== tabId && t.path === oldPath) {
                    updateTabPath(t.id, newPath, `${sanitizedName}.md`);
                }
            }

            // If bookmarked, update the bookmark path
            if (isBookmarked) {
                const bookmark = getBookmarkByPath(oldPath);
                if (bookmark) {
                    await deleteBookmark(bookmark.id);
                    await addBookmark(newPath, `${sanitizedName}.md`, bookmark.tags);
                }
            }
        } catch (err) {
            console.error('Failed to rename file:', err);
        } finally {
            onClose();
        }
    }

    async function handleSendToRecycleBin() {
        // Capture data while component is mounted
        const targetPath = tab?.path;
        const targetTitle = tab?.title;
        const targetId = tabId;

        if (!targetPath) return;

        // Close the menu immediately so it doesn't obscure the modal
        onClose();

        if (!appContext.app.confirmationSuppressed) {
            const result = await confirmDialog({
                title: 'Delete File',
                message: `Are you sure you want to move "${targetTitle}" to the Recycle Bin?`,
                discardLabel: 'Delete',
                saveLabel: undefined,
            });

            if (result !== 'discard') {
                return;
            }
        }

        try {
            // Import services
            const { fileWatcher } = await import('$lib/services/fileWatcher');
            const { invalidateMetadataCache } = await import('$lib/services/fileMetadata');

            // Unwatch the file before deleting
            fileWatcher.unwatch(targetPath);

            // Delete the file
            await callBackend('send_to_recycle_bin', { path: targetPath }, 'File:Write');

            // Invalidate the metadata cache
            invalidateMetadataCache(targetPath);

            // Close the tab (force close to bypass pinned check)
            await requestCloseTab(targetId, true);
        } catch (err) {
            console.error('Failed to delete file:', err);
            // If deletion failed, re-watch the file
            const { fileWatcher } = await import('$lib/services/fileWatcher');
            await fileWatcher.watch(targetPath);
        }
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

    function getHistoryTooltip(tab: {
        content: string;
        title: string;
        path?: string | null;
    }): string {
        const lines = tab.content.slice(0, 300).split('\n').slice(0, 5);
        const preview = lines.join('\n') + (tab.content.length > 300 ? '...' : '');

        let title = tab.title;
        if (tab.path) {
            title += `\n${tab.path}`;
        }

        return `${title}\n\n-- Preview --\n${preview}`;
    }

    function formatTitle(title: string): string {
        if (title.length > 20) {
            return title.substring(0, 20) + '...';
        }
        return title;
    }

    function sc(commandId: string): string {
        return shortcutManager.getShortcutDisplay(commandId);
    }
</script>

<ContextMenu {x} {y} {onClose}>
    {#snippet children({ submenuSide })}
        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handleSave}>
                <Save size={14} class="opacity-70" /><span class="flex-1">Save</span
                >{#if sc('file.save')}<span class="ml-auto text-xs opacity-40"
                        >{sc('file.save')}</span
                    >{/if}
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handleSaveAs}>
                <FileDown size={14} class="opacity-70" /><span class="flex-1">Save As...</span
                >{#if sc('file.saveAs')}<span class="ml-auto text-xs opacity-40"
                        >{sc('file.saveAs')}</span
                    >{/if}
            </button>

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handlePin}>
                {#if isPinned}
                    <PinOff size={14} class="opacity-70" /><span>Unpin</span>
                {:else}
                    <Pin size={14} class="opacity-70" /><span>Pin</span>
                {/if}
            </button>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!tab?.path}
                onclick={handleToggleBookmark}>
                {#if isBookmarked}
                    <BookmarkX size={14} class="opacity-70" /><span class="flex-1"
                        >Remove Bookmark</span>
                {:else}
                    <Bookmark size={14} class="opacity-70" /><span class="flex-1">Add Bookmark</span
                    >{#if sc('markdown.bookmark')}<span class="ml-auto text-xs opacity-40"
                            >{sc('markdown.bookmark')}</span
                        >{/if}
                {/if}
            </button>

            <div class="bg-border-main my-1 h-px"></div>
        </div>

        <Submenu
            show={activeSubmenu === 'export'}
            side={submenuSide}
            onOpen={() => (activeSubmenu = 'export')}
            onClose={() => {
                if (activeSubmenu === 'export') activeSubmenu = null;
            }}>
            {#snippet trigger()}
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
                    <Download size={14} class="mr-2 opacity-70" />
                    <span>Export</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToHtml();
                    onClose();
                }}>Export to HTML</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToPdf();
                    onClose();
                }}>Export to PDF</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToImage('png');
                    onClose();
                }}>Export to PNG</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={async () => {
                    if (appContext.app.activeTabId !== tabId) appContext.app.activeTabId = tabId;
                    await exportService.exportToImage('webp');
                    onClose();
                }}>Export to WEBP</button>
        </Submenu>

        <div
            class="bg-border-main my-1 h-px"
            onmouseenter={() => (activeSubmenu = null)}
            role="none">
        </div>

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
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
                }}>
                <ArrowLeft size={14} class="opacity-70" /><span>Move to Start</span>
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
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
                }}>
                <ArrowRight size={14} class="opacity-70" /><span>Move to End</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isPinned}
                onclick={() => {
                    requestCloseTab(tabId);
                    onClose();
                }}>
                <X size={14} class="opacity-70" /><span class="flex-1">Close</span
                >{#if sc('file.closeTab')}<span class="ml-auto text-xs opacity-40"
                        >{sc('file.closeTab')}</span
                    >{/if}
            </button>
        </div>

        <Submenu
            show={activeSubmenu === 'close'}
            side={submenuSide}
            onOpen={() => (activeSubmenu = 'close')}
            onClose={() => {
                if (activeSubmenu === 'close') activeSubmenu = null;
            }}>
            {#snippet trigger()}
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left">
                    <Files size={14} class="mr-2 opacity-70" />
                    <span>Close Many</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasCloseableTabsToRight}
                onclick={() => handleCloseMany('right')}>Close to the Right</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasCloseableTabsToLeft}
                onclick={() => handleCloseMany('left')}>Close to the Left</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasCloseableOtherTabs}
                onclick={() => handleCloseMany('others')}>Close Others</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasSavedTabs}
                onclick={() => handleCloseMany('saved')}>Close Saved</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasUnsavedTabs}
                onclick={() => handleCloseMany('unsaved')}>Close Not Saved</button>
            <button
                type="button"
                class="text-ui-sm hover-surface w-full px-3 py-1.5 text-left"
                onclick={() => handleCloseMany('all')}>Close All</button>
        </Submenu>

        <div
            class="bg-border-main my-1 h-px"
            onmouseenter={() => (activeSubmenu = null)}
            role="none">
        </div>

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left {appContext
                    .editor.closedTabsHistory.length === 0
                    ? 'opacity-50'
                    : ''}"
                disabled={appContext.editor.closedTabsHistory.length === 0}
                onclick={() => {
                    triggerReopenClosedTab(0);
                    onClose();
                }}>
                <History size={14} class="opacity-70" /><span class="flex-1"
                    >Reopen Last Closed</span
                >{#if sc('edit.reopenClosedTab')}<span class="ml-auto text-xs opacity-40"
                        >{sc('edit.reopenClosedTab')}</span
                    >{/if}
            </button>
        </div>

        <Submenu
            show={activeSubmenu === 'restore'}
            side={submenuSide}
            onOpen={() => (activeSubmenu = 'restore')}
            onClose={() => {
                if (activeSubmenu === 'restore') activeSubmenu = null;
            }}>
            {#snippet trigger()}
                <button
                    type="button"
                    class="text-ui-sm hover-surface flex w-full items-center px-3 py-1.5 text-left {appContext
                        .editor.closedTabsHistory.length === 0
                        ? 'opacity-50'
                        : ''}">
                    <Undo2 size={14} class="mr-2 opacity-70" />
                    <span>Reopen Recent</span>
                    <span class="ml-auto opacity-60">›</span>
                </button>
            {/snippet}

            {#if appContext.editor.closedTabsHistory.length > 0}
                <div class="bg-border-main border-b px-3 py-1.5 text-xs font-semibold opacity-50">
                    RECENTLY CLOSED
                </div>
                {#each appContext.editor.closedTabsHistory as item, i (item.tab.id)}
                    <button
                        type="button"
                        class="text-ui-sm hover-surface flex w-full items-center justify-between px-3 py-1.5 text-left"
                        use:tooltip={getHistoryTooltip(item.tab)}
                        onclick={() => {
                            triggerReopenClosedTab(i);
                            onClose();
                        }}>
                        <span>{formatTitle(item.tab.customTitle || item.tab.title)}</span>
                    </button>
                {/each}
            {:else}
                <div class="text-fg-muted px-3 py-2 text-sm">History empty</div>
            {/if}
        </Submenu>

        <div onmouseenter={() => (activeSubmenu = null)} role="none">
            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={handleRename}>
                <FilePen size={14} class="opacity-70" /><span>Rename</span>
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                onclick={() => {
                    navigator.clipboard.writeText(tab!.title);
                    onClose();
                }}>
                <Copy size={14} class="opacity-70" /><span>Copy File Name</span>
            </button>
            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!tab?.path}
                onclick={() => {
                    navigator.clipboard.writeText(tab!.path!);
                    onClose();
                }}>
                <Copy size={14} class="opacity-70" /><span>Copy Full Path</span>
            </button>

            <div class="bg-border-main my-1 h-px"></div>

            <button
                type="button"
                class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                style="color: var(--color-danger-text)"
                disabled={!tab?.path || isPinned}
                onclick={handleSendToRecycleBin}>
                <Trash2 size={14} class="opacity-70" /><span>Delete to Recycle Bin</span>
            </button>
        </div>
    {/snippet}
</ContextMenu>
