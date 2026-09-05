<script lang="ts">
import {
  ArrowUpToLine,
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
} from "lucide-svelte";
import { onMount, tick } from "svelte";
import { _ } from "svelte-i18n";
import {
  canNavigateUp,
  dirname,
  fileTreeStore,
  navigateInto,
  navigateToParent,
  refreshDirectoryIfInTree,
  refreshTree,
  revealPath,
  setRoot,
  toggle,
} from "$lib/stores/fileTreeStore.svelte";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import type { TreeRow } from "$lib/stores/treeViewStore.svelte";
import { applyFilter, computeTreeRows, treeViewStore } from "$lib/stores/treeViewStore.svelte";
import type { FileEntry } from "$lib/types/api";
import { CONFIG } from "$lib/utils/config";
import { openFile } from "$lib/utils/fileSystem";
import { MARKDOWN_EXTENSION_SET as MARKDOWN_EXT } from "$lib/utils/fileValidation";
import FileTreeContextMenu from "./FileTreeContextMenu.svelte";
import FileTreeFilter from "./FileTreeFilter.svelte";
import FileTreeResizeHandle from "./FileTreeResizeHandle.svelte";
import FileTreeToolbar from "./FileTreeToolbar.svelte";

const ROW_HEIGHT = CONFIG.FILETREE.ROW_HEIGHT;
const OVERSCAN = CONFIG.FILETREE.OVERSCAN;
const INDENT_STEP = CONFIG.FILETREE.INDENT_STEP;

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
let rootDir = $derived(activeTab?.path ? dirname(activeTab.path) : "");

// The tree follows the active document: switching tabs repositions the root
// to that file's folder. It only reacts to a change of the active file's
// folder, not to the tree root itself, so navigating the tree (go up, go
// into) is freely allowed without it snapping back. When the tree is locked
// the root is pinned in place, so the active file is never followed.
let lastFollowedDir = "";
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
let lastActiveDir = "";
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
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
});

// The tree rows, with a ".." parent entry on top whenever a parent exists.
// The parent entry is hidden while the tree is locked, since the root is
// pinned and navigation up is disabled. An active filter replaces the rows
// with the whole-tree search results and always hides the parent entry.
let allRows = $derived.by(() => {
  if (filterActive) return treeViewStore.filterRows;
  const rows = computeTreeRows();
  if (!fileTreeStore.root || !canNavigateUp() || settingsState.fileTreeLocked) {
    return rows;
  }
  return [
    {
      entry: {
        name: "..",
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

// The filter only makes sense for the current root; clear it when the tree
// repositions (following the active file or navigating up/into) so a stale
// query cannot leave the panel showing pruned results for the wrong folder.
let filterQuery = $state("");
let filterRoot = $state("");
$effect(() => {
  const root = fileTreeStore.root;
  if (root === filterRoot) return;
  filterRoot = root;
  filterQuery = "";
});

// The query only applies to the root it was typed under. `filterRoot` is
// updated by the reset effect above, which runs after the render, so a
// re-positioned tree could otherwise be filtered with the previous folder's
// query for one reactive flush. Guarding the derived value makes that single
// frame render the unfiltered tree instead of a pruned or empty one.
let effectiveFilterQuery = $derived(filterRoot === fileTreeStore.root ? filterQuery : "");

let filterActive = $derived(effectiveFilterQuery.trim() !== "");

// Run the whole-tree search as the user types; re-run when the root, the
// markdown-only toggle, or the hidden-files toggle changes so stale results
// are dropped and new matches appear.
$effect(() => {
  settingsState.fileTreeShowHidden;
  void applyFilter(effectiveFilterQuery, settingsState.fileTreeShowMarkdownOnly);
});

let scrollEl = $state<HTMLDivElement>();
let scrollTop = $state(0);
let viewportHeight = $state(0);

let startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
let endIndex = $derived(Math.min(allRows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN));
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

let activeFilePath = $derived(activeTab?.path ?? "");

// Reveal the active file when its tab is activated or the panel becomes
// visible, expanding collapsed ancestors and centering its row.
let lastRevealed = "";
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
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]);
const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "rs",
  "py",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "css",
  "scss",
  "less",
  "html",
  "svelte",
  "vue",
  "sh",
  "bash",
  "zsh",
  "sql",
  "lua",
  "php",
  "rb",
  "kt",
  "swift",
]);
const JSON_EXT = new Set(["json", "jsonc", "toml", "yaml", "yml"]);

let contextMenuEntry = $state<FileEntry | null>(null);
let contextMenuDir = $state("");
let contextMenuX = $state(0);
let contextMenuY = $state(0);
</script>

<div
  class="bg-bg-panel border-border-light file-tree-root relative flex h-full flex-col overflow-hidden border-r"
  style:width={`${appContext.settings.fileTreeWidth}px`}
  style:--ft-row-height={`${ROW_HEIGHT}px`}
>
  <FileTreeToolbar />

  {#if fileTreeStore.root}
    <FileTreeFilter bind:value={filterQuery} loading={treeViewStore.filterLoading} />
  {/if}

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
                }}
      >
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
                            }}
            >
              <span class="ft-chevron flex w-4 shrink-0 items-center justify-center">
                {#if row.entry.is_dir && !row.isParent}
                  {#if row.loading}
                    <LoaderCircle size={12} class="text-fg-muted animate-spin" />
                  {:else}
                    <ChevronRight size={12} class="text-fg-muted shrink-0 {row.expanded ? 'rotate-90' : ''}" />
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
      {#if filterActive && !treeViewStore.filterLoading && allRows.length <= 1}
        <div class="text-fg-muted flex h-12 items-center justify-center px-4 text-center text-xs">
          {$_('fileTree.noFilterMatch')}
        </div>
      {/if}
    {/if}
  </div>

  <FileTreeResizeHandle />

  {#if contextMenuDir}
    <FileTreeContextMenu
      entry={contextMenuEntry}
      directory={contextMenuDir}
      x={contextMenuX}
      y={contextMenuY}
      onClose={() => {
                contextMenuEntry = null;
                contextMenuDir = '';
            }}
    />
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
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--accent-secondary);
}
</style>
