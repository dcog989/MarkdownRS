<script lang="ts">
import { Bookmark, Eye, EyeOff, Feather, FolderTree, History, Settings, Zap } from 'lucide-svelte';
import { _ } from 'svelte-i18n';
import { translate } from '$lib/i18n';
import { toggleWriterMode } from '$lib/stores/appState.svelte';
import {
    toggleAbout,
    toggleBookmarks,
    toggleCommandPalette,
    toggleFileHistory,
    toggleSettings,
} from '$lib/stores/interfaceStore.svelte';
import { toggleFileTree, toggleSplitView } from '$lib/stores/settingsState.svelte';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { isMarkdownFile } from '$lib/utils/fileValidation';
import { saveSettings } from '$lib/utils/settings';
import { shortcutManager } from '$lib/utils/shortcuts';

let { showMenu = $bindable(false) } = $props<{
    showMenu?: boolean;
}>();

let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
let isPreviewAvailable = $derived(
    activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true,
);

let shortcuts = $derived({
    settings: shortcutManager.getShortcutDisplay('window.settings'),
    commands: shortcutManager.getShortcutDisplay('window.commandPalette'),
    bookmarks: shortcutManager.getShortcutDisplay('window.bookmarks'),
    fileHistory: shortcutManager.getShortcutDisplay('file.fileHistory'),
    splitView: shortcutManager.getShortcutDisplay('view.toggleSplitView'),
    writerMode: shortcutManager.getShortcutDisplay('view.toggleWriterMode'),
    fileTree: shortcutManager.getShortcutDisplay('view.toggleFileTree'),
});

function toggleSplit() {
    if (!isPreviewAvailable) {
        showToast('warning', translate('tabBarMenu.previewNotAvailable'));
        return;
    }
    toggleSplitView();
    saveSettings();
}

function handleWriterMode() {
    toggleWriterMode();
}

function closeMenu() {
    showMenu = false;
}
</script>

{#if showMenu}
    <div
        role="button"
        tabindex="0"
        aria-label={$_('tabBarMenu.closeMenu')}
        class="fixed inset-0 z-200"
        onclick={closeMenu}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeMenu(); }}></div>
    <div
        role="dialog"
        tabindex="-1"
        class="bg-bg-panel border-border-light text-fg-default absolute top-full right-0 z-200 mt-1 rounded-lg border py-1 shadow-xl w-80"
        onclick={(e) => e.stopPropagation()}
        onkeydown={() => {}}>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleCommandPalette();
                closeMenu();
            }}>
            <Zap size={14} class="opacity-70" />
            <span class="flex-1">{$_('tabBarMenu.commandPalette')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.commands}</span>
        </button>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleBookmarks();
                closeMenu();
            }}>
            <Bookmark size={14} class="opacity-70" />
            <span class="flex-1">{$_('tabBarMenu.bookmarks')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.bookmarks}</span>
        </button>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleFileHistory();
                closeMenu();
            }}>
            <History size={14} class="opacity-70" />
            <span class="flex-1">{$_('tabBarMenu.fileHistory')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.fileHistory}</span>
        </button>

        <div class="bg-border-main my-1 h-px"></div>

        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            class:opacity-50={!isPreviewAvailable}
            class:cursor-not-allowed={!isPreviewAvailable}
            onclick={() => {
                if (isPreviewAvailable) {
                    toggleSplit();
                    closeMenu();
                }
            }}>
            {#if isPreviewAvailable}
                <Eye size={14} class="opacity-70" />
            {:else}
                <EyeOff size={14} class="opacity-50" />
            {/if}
            <span class="flex-1">{$_('tabBarMenu.toggleSplitPreview')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.splitView}</span>
        </button>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleFileTree();
                saveSettings();
                closeMenu();
            }}>
            <FolderTree size={14} class="opacity-70" />
            <span class="flex-1">{$_('tabBarMenu.toggleFileTree')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.fileTree}</span>
        </button>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                handleWriterMode();
                closeMenu();
            }}>
            <Feather size={14} class="opacity-70" />
            <span class="flex-1">{$_('tabBarMenu.writerMode')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.writerMode}</span>
        </button>

        <div class="bg-border-main my-1 h-px"></div>

        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleSettings();
                closeMenu();
            }}>
            <Settings size={14} class="opacity-70" /><span class="flex-1">{$_('tabBarMenu.settings')}</span
            ><span class="ml-auto text-xs opacity-40">{shortcuts.settings}</span>
        </button>
        <button
            type="button"
            class="text-ui-sm hover-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
            onclick={() => {
                toggleAbout();
                closeMenu();
            }}>
            <img src="/logo.svg" alt="" class="h-4 w-4" /><span>{$_('tabBarMenu.about')}</span>
        </button>
    </div>
{/if}
