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
        Link,
        LoaderCircle,
        Minus,
        Unlink,
    } from 'lucide-svelte';
    import { tooltip } from '$lib/actions/tooltip';
    import {
        canNavigateUp,
        collapseAll,
        dirname,
        fileTreeStore,
        isExpanded,
        navigateInto,
        navigateToParent,
        setRoot,
        toggle,
        toggleHiddenFiles,
    } from '$lib/stores/fileTreeStore.svelte';
    import { toggleFileTree, toggleFileTreeFollow } from '$lib/stores/settingsState.svelte';
    import { appContext } from '$lib/stores/state.svelte';
    import type { FileEntry } from '$lib/types/api';
    import { CONFIG } from '$lib/utils/config';
    import { openFile } from '$lib/utils/fileSystem';
    import { formatFileSize } from '$lib/utils/fileValidation';
    import { saveSettings } from '$lib/utils/settings';

    const ROW_HEIGHT = CONFIG.FILETREE.ROW_HEIGHT;
    const OVERSCAN = CONFIG.FILETREE.OVERSCAN;
    const INDENT_STEP = CONFIG.FILETREE.INDENT_STEP;

    type TreeRow = {
        entry: FileEntry;
        depth: number;
        expanded: boolean;
        loading: boolean;
        isRoot: boolean;
    };

    function basename(path: string): string {
        return path.split('/').filter(Boolean).pop() || path;
    }

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let rootDir = $derived(activeTab?.path ? dirname(activeTab.path) : '');

    $effect(() => {
        if (
            appContext.settings.fileTreeFollowDocument &&
            rootDir &&
            rootDir !== fileTreeStore.root
        ) {
            setRoot(rootDir);
        }
    });

    let allRows = $derived.by(() => {
        const rows: TreeRow[] = [];
        const { root, expanded, children, loading } = fileTreeStore;
        if (!root) return rows;

        rows.push({
            entry: {
                name: basename(root) || root,
                path: root,
                is_dir: true,
                is_symlink: false,
                size: 0,
                modified: null,
            },
            depth: 0,
            expanded: expanded.get(root) ?? false,
            loading: loading.get(root) ?? false,
            isRoot: true,
        });

        if (!(expanded.get(root) ?? false)) return rows;

        type StackItem = { entry: FileEntry; depth: number };
        const stack: StackItem[] = [];
        const rootChildren = children.get(root) ?? [];
        for (let i = rootChildren.length - 1; i >= 0; i--) {
            stack.push({ entry: rootChildren[i], depth: 1 });
        }

        while (stack.length > 0) {
            const item = stack.pop();
            if (!item) break;
            const { entry, depth } = item;
            const isDir = entry.is_dir;
            const isOpen = isDir && (expanded.get(entry.path) ?? false);
            rows.push({
                entry,
                depth,
                expanded: isOpen,
                loading: isDir ? (loading.get(entry.path) ?? false) : false,
                isRoot: false,
            });
            if (isOpen) {
                const kids = children.get(entry.path) ?? [];
                for (let i = kids.length - 1; i >= 0; i--) {
                    stack.push({ entry: kids[i], depth: depth + 1 });
                }
            }
        }
        return rows;
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

    let folderClickTimer: ReturnType<typeof setTimeout> | null = null;

    function handleRowClick(row: TreeRow) {
        if (row.entry.is_dir) {
            if (folderClickTimer) clearTimeout(folderClickTimer);
            folderClickTimer = setTimeout(
                () => void toggle(row.entry.path),
                CONFIG.FILETREE.DBL_CLICK_DELAY_MS,
            );
        } else {
            void openFile(row.entry.path);
        }
    }

    function handleRowDoubleClick(row: TreeRow) {
        if (!row.entry.is_dir) return;
        if (folderClickTimer) {
            clearTimeout(folderClickTimer);
            folderClickTimer = null;
        }
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
            saveSettings();
        };
        const onUp = () => {
            isResizing = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
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
    class="bg-bg-panel border-border-light relative flex h-full flex-col overflow-hidden border-r"
    style:width={`${appContext.settings.fileTreeWidth}px`}
    class:cursor-col-resize={isResizing}>
    <div class="border-border-light flex h-8 shrink-0 items-center gap-1 border-b pl-2 pr-1">
        <button
            type="button"
            class="hover-surface text-fg-default flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs font-medium"
            use:tooltip={fileTreeStore.root || null}
            onclick={() => {
                if (fileTreeStore.root) void toggle(fileTreeStore.root);
            }}>
            {#if isExpanded(fileTreeStore.root)}
                <FolderOpen size={14} class="text-accent-secondary shrink-0" />
            {:else}
                <Folder size={14} class="text-accent-secondary shrink-0" />
            {/if}
            <span class="truncate">{basename(fileTreeStore.root) || 'File Tree'}</span>
        </button>

        <div class="text-fg-muted flex shrink-0 items-center">
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:cursor-not-allowed={!canNavigateUp()}
                class:opacity-40={!canNavigateUp()}
                use:tooltip={'Go up one level'}
                onclick={navigateToParent}>
                <ArrowUpToLine size={14} />
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:bg-bg-active={appContext.settings.fileTreeFollowDocument}
                class:text-accent-secondary={appContext.settings.fileTreeFollowDocument}
                use:tooltip={
                    appContext.settings.fileTreeFollowDocument
                        ? 'Stop following active document'
                        : 'Follow active document'
                }
                onclick={() => {
                    toggleFileTreeFollow();
                    saveSettings();
                }}>
                {#if appContext.settings.fileTreeFollowDocument}
                    <Link size={14} />
                {:else}
                    <Unlink size={14} />
                {/if}
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                class:bg-bg-active={fileTreeStore.showHidden}
                class:text-accent-secondary={fileTreeStore.showHidden}
                use:tooltip={fileTreeStore.showHidden ? 'Hide hidden files' : 'Show hidden files'}
                onclick={toggleHiddenFiles}>
                {#if fileTreeStore.showHidden}
                    <Eye size={14} />
                {:else}
                    <EyeOff size={14} />
                {/if}
            </button>
            <button
                type="button"
                class="hover-surface flex h-6 w-6 items-center justify-center rounded"
                use:tooltip={'Collapse all'}
                onclick={collapseAll}>
                <Minus size={14} />
            </button>
        </div>
    </div>

    <div class="min-h-0 flex-1">
        {#if !fileTreeStore.root}
            <div class="text-fg-muted flex h-full items-center justify-center px-4 text-center text-xs">
                Open a file to browse its folder
            </div>
        {:else}
            <div
                bind:this={scrollEl}
                class="ft-scroll h-full overflow-y-auto"
                onscroll={(e) => {
                    scrollTop = e.currentTarget.scrollTop;
                }}>
                <div class="ft-spacer relative" style:height={`${spacerHeight}px`}>
                    {#each visibleRows as row, i (row.entry.path)}
                        {@const rowIndex = startIndex + i}
                        <button
                            type="button"
                            class="ft-row hover-surface group flex items-center pr-2 text-left"
                            style:top={`${rowIndex * ROW_HEIGHT}px`}
                            style:padding-left={`${8 + row.depth * INDENT_STEP}px`}
                            class:ft-active={!row.isRoot && row.entry.path === activeFilePath}
                            class:opacity-70={!row.isRoot && row.entry.name.startsWith('.')}
                            title={row.entry.path}
                            onclick={() => handleRowClick(row)}
                            ondblclick={() => handleRowDoubleClick(row)}>
                            <span class="ft-chevron flex w-4 shrink-0 items-center justify-center">
                                {#if row.entry.is_dir}
                                    {#if row.loading}
                                        <LoaderCircle size={12} class="text-fg-muted animate-spin" />
                                    {:else}
                                        <ChevronRight
                                            size={12}
                                            class="text-fg-muted shrink-0 {row.expanded ? 'rotate-90' : ''}" />
                                    {/if}
                                {/if}
                            </span>

                            {#if row.entry.is_dir}
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

                            {#if !row.entry.is_dir && row.entry.size > 0}
                                <span class="ft-size text-fg-muted shrink-0 text-[10px] opacity-60">
                                    {formatFileSize(row.entry.size)}
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    <div
        role="button"
        tabindex="0"
        aria-label="Resize or collapse file tree panel"
        class="ft-resize-handle"
        class:cursor-col-resize={isResizing}
        onmousedown={startResize}
        onkeydown={() => {}}
        onclick={handleResizeClick}
        ondblclick={() => {
            appContext.settings.fileTreeWidth = CONFIG.FILETREE.DEFAULT_WIDTH;
            saveSettings();
        }}>
        <ChevronLeft size={36} class="ft-collapse-icon" />
    </div>
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
        height: 26px;
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

    .ft-size {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
            'Courier New', monospace;
    }

    .ft-resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 6px;
        cursor: col-resize;
        z-index: 30;
        transition: background-color 150ms ease-out;
    }

    .ft-resize-handle:hover {
        background-color: var(--accent-primary);
    }

    :global(.ft-collapse-icon) {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        padding: 4px;
        border-radius: 6px;
        color: var(--text-secondary);
        background-color: var(--surface-hover);
        opacity: 0;
        cursor: pointer;
        transition: opacity 150ms ease-out;
    }

    .ft-resize-handle:hover :global(.ft-collapse-icon) {
        opacity: 1;
    }

    .cursor-col-resize {
        cursor: col-resize;
    }
</style>
