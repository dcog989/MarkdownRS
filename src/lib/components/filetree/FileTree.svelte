<script lang="ts">
    import {
        ArrowUpToLine,
        ChevronLeft,
        ChevronRight,
        Eye,
        EyeOff,
        File,
        FileCode,
        FileImage,
        FileJson,
        FileText,
        Folder,
        FolderOpen,
        FolderTree,
        FoldVertical,
        LoaderCircle,
        Lock,
        LockOpen,
        RefreshCw,
    } from 'lucide-svelte';
    import { onMount, tick } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { tooltip } from '$lib/actions/tooltip';
    import type { TreeRow } from '$lib/stores/fileTreeStore.svelte';
    import {
        canNavigateUp,
        collapseAll,
        computeTreeRows,
        dirname,
        fileTreeStore,
        navigateInto,
        navigateToParent,
        refreshDirectoryIfInTree,
        refreshTree,
        revealPath,
        setRoot,
        toggle,
        toggleHiddenFiles,
        toggleMarkdownOnly,
    } from '$lib/stores/fileTreeStore.svelte';
    import {
        settingsState,
        toggleFileTree,
        toggleFileTreeLocked,
    } from '$lib/stores/settingsState.svelte';
    import { appContext } from '$lib/stores/state.svelte';
    import type { FileEntry } from '$lib/types/api';
    import { CONFIG } from '$lib/utils/config';
    import { openFile } from '$lib/utils/fileSystem';
    import { saveSettings } from '$lib/utils/settings';
    import FileTreeContextMenu from './FileTreeContextMenu.svelte';

    const ROW_HEIGHT = CONFIG.FILETREE.ROW_HEIGHT;
    const OVERSCAN = CONFIG.FILETREE.OVERSCAN;
    const INDENT_STEP = CONFIG.FILETREE.INDENT_STEP;

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let rootDir = $derived(activeTab?.path ? dirname(activeTab.path) : '');

    // The tree follows the active document: switching tabs repositions the root
    // to that file's folder. It only reacts to a change of the active file's
    // folder, not to the tree root itself, so navigating the tree (go up, go
    // into) is freely allowed without it snapping back. When the tree is locked
    // the root is pinned in place, so the active file is never followed.
    let lastFollowedDir = '';
    $effect(() => {
        if (settingsState.fileTreeLocked) return;
        if (!rootDir || rootDir === lastFollowedDir) return;
        lastFollowedDir = rootDir;
        if (rootDir !== fileTreeStore.root) {
            setRoot(rootDir);
        }
    });

    // While the tree is locked, restore the pinned root from settings on
    // startup (the follow effect above is disabled in that state). Placed
    // before the reveal effect so the active file can still be revealed
    // inside the restored root.
    $effect(() => {
        if (!settingsState.fileTreeLocked) return;
        const lockedRoot = settingsState.fileTreeLockedRoot;
        if (!lockedRoot || lockedRoot === fileTreeStore.root) return;
        setRoot(lockedRoot);
    });

    // When the active document changes, refresh its directory so the tree
    // reflects saves/renames/new files next to the file you are editing.
    let lastActiveDir = '';
    $effect(() => {
        const dir = rootDir;
        if (!dir || dir === lastActiveDir) return;
        lastActiveDir = dir;
        refreshDirectoryIfInTree(dir);
    });

    onMount(() => {
        const onFocus = () => {
            if (fileTreeStore.root) void refreshTree();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    });

    // The tree rows, with a ".." parent entry on top whenever a parent exists.
    // The parent entry is hidden while the tree is locked, since the root is
    // pinned and navigation up is disabled.
    let allRows = $derived.by(() => {
        const rows = computeTreeRows();
        if (!fileTreeStore.root || !canNavigateUp() || settingsState.fileTreeLocked) return rows;
        return [
            {
                entry: {
                    name: '..',
                    path: dirname(fileTreeStore.root),
                    is_dir: true,
                    is_symlink: false,
                    size: 0,
                    modified: null,
                },
                depth: 0,
                expanded: false,
                loading: false,
                isRoot: false,
                isParent: true,
            },
            ...rows,
        ];
    });

    let scrollEl = $state<HTMLDivElement>();
    let scrollTop = $state(0);
    let viewportHeight = $state(0);

    let startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
    let endIndex = $derived(
        Math.min(allRows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN),
    );
    let visibleRows = $derived(allRows.slice(startIndex, endIndex));
    let spacerHeight = $derived(allRows.length * ROW_HEIGHT);

    $effect(() => {
        if (!scrollEl) return;
        const el = scrollEl;
        const ro = new ResizeObserver(() => {
            viewportHeight = el.clientHeight;
        });
        ro.observe(el);
        viewportHeight = el.clientHeight;
        return () => ro.disconnect();
    });

    let activeFilePath = $derived(activeTab?.path ?? '');

    // Reveal the active file when its tab is activated or the panel becomes
    // visible, expanding collapsed ancestors and centering its row.
    let lastRevealed = '';
    $effect(() => {
        if (!settingsState.fileTreeVisible) return;
        const path = activeFilePath;
        if (!path || path === lastRevealed) return;
        lastRevealed = path;
        void revealActiveFile(path);
    });

    async function revealActiveFile(path: string) {
        const found = await revealPath(path);
        if (!found) return;
        await tick();
        const rowIndex = allRows.findIndex((r) => r.entry.path === path);
        if (rowIndex === -1 || !scrollEl) return;
        const top = rowIndex * ROW_HEIGHT;
        const bottom = top + ROW_HEIGHT;
        if (top < scrollEl.scrollTop || bottom > scrollEl.scrollTop + viewportHeight) {
            scrollEl.scrollTop = Math.max(0, top + ROW_HEIGHT / 2 - viewportHeight / 2);
        }
    }

    function handleLockToggle() {
        toggleFileTreeLocked();
        if (settingsState.fileTreeLocked) {
            settingsState.fileTreeLockedRoot = fileTreeStore.root;
        } else {
            settingsState.fileTreeLockedRoot = '';
        }
        saveSettings();
    }

    function handleRowClick(e: MouseEvent, row: TreeRow) {
        if (row.isParent) {
            // Root navigation is disabled while the tree is locked.
            if (settingsState.fileTreeLocked) return;
            // Single click navigates up; ignore the second click of a dblclick
            // so a double-click does not ascend two levels.
            if (e.detail > 1) return;
            navigateToParent();
            return;
        }
        if (!row.entry.is_dir) {
            void openFile(row.entry.path);
            return;
        }
        // The second click of a double-click has detail === 2; the dblclick
        // handler navigates into the folder, so don't toggle on it.
        if (e.detail > 1) return;
        void toggle(row.entry.path);
    }

    function handleRowDoubleClick(row: TreeRow) {
        if (settingsState.fileTreeLocked) return;
        if (row.isParent || !row.entry.is_dir) return;
        navigateInto(row.entry.path);
    }

    function ext(name: string): string {
        const idx = name.lastIndexOf('.');
        return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
    }

    const MARKDOWN_EXT = new Set(['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn']);
    const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
    const CODE_EXT = new Set([
        'ts',
        'tsx',
        'js',
        'jsx',
        'rs',
        'py',
        'go',
        'java',
        'c',
        'cpp',
        'h',
        'hpp',
        'cs',
        'css',
        'scss',
        'less',
        'html',
        'svelte',
        'vue',
        'sh',
        'bash',
        'zsh',
        'sql',
        'lua',
        'php',
        'rb',
        'kt',
        'swift',
    ]);
    const JSON_EXT = new Set(['json', 'jsonc', 'toml', 'yaml', 'yml']);

    let isResizing = $state(false);
    let didDrag = false;

    let contextMenuEntry = $state<FileEntry | null>(null);
    let contextMenuDir = $state('');
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    function startResize(e: MouseEvent) {
        e.preventDefault();
        isResizing = true;
        didDrag = false;
        const startX = e.clientX;
        const startWidth = appContext.settings.fileTreeWidth;

        const onMove = (ev: MouseEvent) => {
            if (Math.abs(ev.clientX - startX) > 3) {
                didDrag = true;
            }
            const newWidth = startWidth + (ev.clientX - startX);
            appContext.settings.fileTreeWidth = Math.max(
                CONFIG.FILETREE.MIN_WIDTH,
                Math.min(CONFIG.FILETREE.MAX_WIDTH, newWidth),
            );
        };
        const onUp = () => {
            isResizing = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            if (didDrag) saveSettings();
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
    }

    function handleResizeClick() {
        if (didDrag) return;
        toggleFileTree();
    }
</script>

<div
    class="bg-bg-panel border-border-light file-tree-root relative flex h-full flex-col overflow-hidden border-r"
    style:width={`${appContext.settings.fileTreeWidth}px`}
    style:--ft-row-height={`${ROW_HEIGHT}px`}
    class:cursor-col-resize={isResizing}>
    <div class="border-border-light flex h-8 shrink-0 items-center gap-1 border-b pl-2 pr-1">
        <div class="text-fg-muted flex shrink-0 items-center">
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:bg-bg-active={settingsState.fileTreeShowHidden}
                class:text-accent-secondary={settingsState.fileTreeShowHidden}
                use:tooltip={$_('fileTree.showHidden')}
                onclick={() => {
                    toggleHiddenFiles();
                    saveSettings();
                }}>
                {#if settingsState.fileTreeShowHidden}
                    <Eye size={14} />
                {:else}
                    <EyeOff size={14} />
                {/if}
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:bg-bg-active={settingsState.fileTreeShowMarkdownOnly}
                class:text-accent-secondary={settingsState.fileTreeShowMarkdownOnly}
                use:tooltip={$_('fileTree.showMarkdownOnly')}
                onclick={() => {
                    toggleMarkdownOnly();
                    saveSettings();
                }}>
                <FileText size={14} />
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:bg-bg-active={settingsState.fileTreeLocked}
                class:text-accent-secondary={settingsState.fileTreeLocked}
                aria-label={$_(
                    settingsState.fileTreeLocked ? 'fileTree.unlockTree' : 'fileTree.lockTree',
                )}
                use:tooltip={$_(
                    settingsState.fileTreeLocked ? 'fileTree.unlockTree' : 'fileTree.lockTree',
                )}
                onclick={handleLockToggle}>
                {#if settingsState.fileTreeLocked}
                    <LockOpen size={14} />
                {:else}
                    <Lock size={14} />
                {/if}
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                use:tooltip={$_('fileTree.collapseAll')}
                onclick={collapseAll}>
                <FoldVertical size={14} />
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:pointer-events-none={fileTreeStore.refreshing}
                use:tooltip={$_('fileTree.refresh')}
                onclick={() => void refreshTree()}>
                <span class:animate-spin={fileTreeStore.refreshing} class="flex">
                    <RefreshCw size={14} />
                </span>
            </button>
        </div>
        <div class="text-fg-muted ml-auto flex shrink-0 items-center">
            <button
                type="button"
                class="bg-bg-active text-accent-secondary hover-surface flex h-6 w-6 items-center justify-center rounded"
                use:tooltip={$_('tabBar.hideFileTree')}
                onclick={() => {
                    toggleFileTree();
                    saveSettings();
                }}>
                <FolderTree size={14} />
            </button>
        </div>
    </div>

    <div class="min-h-0 flex-1">
        {#if !fileTreeStore.root}
            <div class="text-fg-muted flex h-full items-center justify-center px-4 text-center text-xs">
                {$_('fileTree.emptyState')}
            </div>
        {:else}
            <div
                bind:this={scrollEl}
                role="list"
                class="ft-scroll h-full overflow-y-auto"
                onscroll={(e) => {
                    scrollTop = e.currentTarget.scrollTop;
                }}
                oncontextmenu={(e) => {
                    if ((e.target as HTMLElement).closest('.ft-row')) return;
                    e.preventDefault();
                    contextMenuEntry = null;
                    contextMenuDir = fileTreeStore.root;
                    contextMenuX = e.clientX;
                    contextMenuY = e.clientY;
                }}>
                <div class="ft-spacer relative" style:height={`${spacerHeight}px`}>
                    {#each visibleRows as row, i (row.entry.path)}
                        {@const rowIndex = startIndex + i}
                        <button
                            type="button"
                            class="ft-row hover-surface group flex items-center pr-2 text-left"
                            style:top={`${rowIndex * ROW_HEIGHT}px`}
                            style:padding-left={`${8 + row.depth * INDENT_STEP}px`}
                            class:ft-active={!row.isRoot && !row.isParent && row.entry.path === activeFilePath}
                            class:opacity-70={!row.isRoot && !row.isParent && row.entry.name.startsWith('.')}
                            title={row.entry.path}
                            onclick={(e) => handleRowClick(e, row)}
                            ondblclick={() => handleRowDoubleClick(row)}
                            oncontextmenu={(e) => {
                                if (row.isRoot || row.isParent) return;
                                e.preventDefault();
                                e.stopPropagation();
                                contextMenuEntry = row.entry;
                                contextMenuDir = row.entry.is_dir
                                    ? row.entry.path
                                    : dirname(row.entry.path);
                                contextMenuX = e.clientX;
                                contextMenuY = e.clientY;
                            }}>
                            <span class="ft-chevron flex w-4 shrink-0 items-center justify-center">
                                {#if row.entry.is_dir && !row.isParent}
                                    {#if row.loading}
                                        <LoaderCircle size={12} class="text-fg-muted animate-spin" />
                                    {:else}
                                        <ChevronRight
                                            size={12}
                                            class="text-fg-muted shrink-0 {row.expanded ? 'rotate-90' : ''}" />
                                    {/if}
                                {/if}
                            </span>

                            {#if row.isParent}
                                <ArrowUpToLine size={14} class="text-fg-muted shrink-0" />
                            {:else if row.entry.is_dir}
                                {#if row.expanded}
                                    <FolderOpen size={14} class="text-accent-secondary shrink-0" />
                                {:else}
                                    <Folder size={14} class="text-accent-secondary shrink-0" />
                                {/if}
                            {:else}
                                {#if MARKDOWN_EXT.has(ext(row.entry.name))}
                                    <FileText size={14} class="text-accent-file shrink-0" />
                                {:else if IMAGE_EXT.has(ext(row.entry.name))}
                                    <FileImage size={14} class="text-accent-filepath shrink-0" />
                                {:else if CODE_EXT.has(ext(row.entry.name))}
                                    <FileCode size={14} class="text-accent-link shrink-0" />
                                {:else if JSON_EXT.has(ext(row.entry.name))}
                                    <FileJson size={14} class="text-accent-url shrink-0" />
                                {:else}
                                    <File size={14} class="text-fg-muted shrink-0" />
                                {/if}
                            {/if}

                            <span class="ft-name min-w-0 flex-1 truncate">{row.entry.name}</span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <div
        role="button"
        tabindex="0"
        aria-label={$_('fileTree.resizeAria')}
        class="ft-resize-handle"
        class:cursor-col-resize={isResizing}
        onmousedown={startResize}
        onkeydown={() => {}}
        onclick={handleResizeClick}
        ondblclick={() => {
            appContext.settings.fileTreeWidth = CONFIG.FILETREE.DEFAULT_WIDTH;
            saveSettings();
        }}>
        <span class="ft-collapse-icon">
            <ChevronLeft size={44} />
        </span>
    </div>

    {#if contextMenuDir}
        <FileTreeContextMenu
            entry={contextMenuEntry}
            directory={contextMenuDir}
            x={contextMenuX}
            y={contextMenuY}
            onClose={() => {
                contextMenuEntry = null;
                contextMenuDir = '';
            }} />
    {/if}
</div>

<style>
    .ft-scroll {
        scrollbar-width: thin;
        scrollbar-color: var(--border-primary) transparent;
    }

    .ft-spacer {
        width: 100%;
    }

    .ft-row {
        position: absolute;
        left: 0;
        right: 0;
        height: var(--ft-row-height);
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        color: var(--text-primary);
    }

    .ft-row:hover {
        background-color: var(--surface-hover);
    }

    .ft-row.ft-active {
        background-color: var(--surface-active);
    }

    .ft-row.ft-active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background-color: var(--accent-secondary);
    }

    .ft-resize-handle {
        position: absolute;
        top: 2rem;
        right: 0;
        bottom: 0;
        width: 6px;
        cursor: col-resize;
        z-index: 30;
        transition: background-color 150ms ease-out;
    }

    .ft-resize-handle:hover {
        background-color: var(--accent-primary);
        transition-delay: 250ms;
    }

    .ft-collapse-icon {
        position: absolute;
        top: 0;
        right: 6px;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        border-radius: 6px;
        color: var(--text-secondary);
        background-color: var(--surface-hover);
        opacity: 0;
        cursor: pointer;
        transition: opacity 150ms ease-out;
    }

    .ft-resize-handle:hover .ft-collapse-icon {
        opacity: 1;
        transition-delay: 250ms;
    }

    .cursor-col-resize {
        cursor: col-resize;
    }
</style>
