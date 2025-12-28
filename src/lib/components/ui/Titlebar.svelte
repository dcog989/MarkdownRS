<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { OPERATION_CATEGORIES, getOperationsByCategory } from "$lib/config/textOperationsRegistry";
    import { exportService } from "$lib/services/exportService";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { openFile, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { saveSettings } from "$lib/utils/settings";
    import { shortcutManager } from "$lib/utils/shortcuts";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Bookmark, Copy, Eye, EyeOff, Minus, Settings, Square, X, Zap } from "lucide-svelte";
    import { onMount } from "svelte";
    import AboutModal from "./AboutModal.svelte";
    import BookmarksModal from "./BookmarksModal.svelte";
    import CommandPalette, { type Command } from "./CommandPalette.svelte";
    import SettingsModal from "./SettingsModal.svelte";
    import ShortcutsModal from "./ShortcutsModal.svelte";
    import TextTransformModal from "./TextTransformModal.svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);
    let showSettingsModal = $state(false);
    let showAboutModal = $state(false);
    let showTransformModal = $state(false);
    let showShortcutsModal = $state(false);
    let showBookmarksModal = $state(false);
    let showCommandPalette = $state(false);

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);

    function toggleSplit() {
        if (!isMarkdown) {
            appContext.ui.toast.warning("Preview not available for this file type");
            return;
        }
        appContext.app.toggleSplitView();
        saveSettings();
    }

    const allCommands: Command[] = [
        {
            id: "new",
            label: "File: New File",
            shortcut: "Ctrl+N",
            action: () => {
                const id = appContext.editor.addTab();
                appContext.app.activeTabId = id;
            },
        },
        {
            id: "open",
            label: "File: Open File",
            shortcut: "Ctrl+O",
            action: () => openFile(),
        },
        {
            id: "save",
            label: "File: Save",
            shortcut: "Ctrl+S",
            action: () => saveCurrentFile(),
        },
        {
            id: "close",
            label: "File: Close Tab",
            shortcut: "Ctrl+W",
            action: () => {
                if (appContext.app.activeTabId) requestCloseTab(appContext.app.activeTabId);
            },
        },
        {
            id: "export-html",
            label: "File: Export to HTML",
            action: () => exportService.exportToHtml(),
        },
        {
            id: "export-pdf",
            label: "File: Export to PDF",
            action: () => exportService.exportToPdf(),
        },
        {
            id: "export-png",
            label: "File: Export to PNG",
            action: () => exportService.exportToImage("png"),
        },
        {
            id: "format",
            label: "Format: Format Document",
            shortcut: "Shift+Alt+F",
            action: () => appContext.editor.performTextTransform("format-document"),
        },
        {
            id: "theme-dark",
            label: "Theme: Dark",
            action: () => {
                appContext.app.setTheme("dark");
                saveSettings();
            },
        },
        {
            id: "theme-light",
            label: "Theme: Light",
            action: () => {
                appContext.app.setTheme("light");
                saveSettings();
            },
        },
        {
            id: "toggle-split",
            label: "View: Toggle Split Preview",
            shortcut: "Ctrl+\\",
            action: () => {
                toggleSplit();
            },
        },
        {
            id: "toggle-whitespace",
            label: "View: Toggle Whitespace",
            action: () => {
                appContext.app.showWhitespace = !appContext.app.showWhitespace;
                saveSettings();
            },
        },
        {
            id: "bookmarks",
            label: "Window: Bookmarks",
            shortcut: "Ctrl+B",
            action: () => {
                showBookmarksModal = true;
            },
        },
        {
            id: "settings",
            label: "Window: Settings",
            shortcut: "Ctrl+,",
            action: () => {
                showSettingsModal = true;
            },
        },
        {
            id: "shortcuts",
            label: "Window: Keyboard Shortcuts",
            shortcut: "F1",
            action: () => {
                showShortcutsModal = true;
            },
        },
        {
            id: "transform",
            label: "Window: Text Transformations",
            shortcut: "Ctrl+T",
            action: () => {
                showTransformModal = true;
            },
        },
        {
            id: "about",
            label: "Window: About",
            action: () => {
                showAboutModal = true;
            },
        },
    ];

    const textOperationCommands: Command[] = OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id).map((op) => ({
            id: `ops-${op.id}`,
            label: `${category.title}: ${op.label}`,
            action: () => appContext.editor.performTextTransform(op.id),
        }))
    );

    const commands = $derived(
        [...allCommands, ...textOperationCommands].sort((a, b) => {
            const catA = a.label.split(":")[0].trim();
            const catB = b.label.split(":")[0].trim();
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            return a.label.localeCompare(b.label);
        })
    );

    function registerShortcuts() {
        const openTransform = () => {
            showTransformModal = true;
        };
        shortcutManager.register({ id: "win-transform-ctrl", key: "t", ctrl: true, category: "Window", description: "Text Transformations", handler: openTransform });
        shortcutManager.register({ id: "win-transform-meta", key: "t", meta: true, category: "Window", description: "Text Transformations", handler: openTransform });

        const openPalette = () => {
            showCommandPalette = true;
        };
        shortcutManager.register({ id: "win-palette-ctrl", key: "p", ctrl: true, category: "Window", description: "Command Palette", handler: openPalette });
        shortcutManager.register({ id: "win-palette-meta", key: "p", meta: true, category: "Window", description: "Command Palette", handler: openPalette });

        const openBookmarks = () => {
            showBookmarksModal = true;
        };
        shortcutManager.register({ id: "win-bookmarks-ctrl", key: "b", ctrl: true, category: "Window", description: "Bookmarks", handler: openBookmarks });
        shortcutManager.register({ id: "win-bookmarks-meta", key: "b", meta: true, category: "Window", description: "Bookmarks", handler: openBookmarks });

        const openSettings = () => {
            showSettingsModal = true;
        };
        shortcutManager.register({ id: "win-settings-ctrl", key: ",", ctrl: true, category: "Window", description: "Settings", handler: openSettings });
        shortcutManager.register({ id: "win-settings-meta", key: ",", meta: true, category: "Window", description: "Settings", handler: openSettings });

        shortcutManager.register({
            id: "win-help",
            key: "F1",
            category: "Window",
            description: "Keyboard Shortcuts",
            handler: () => {
                showShortcutsModal = true;
            },
        });
    }

    function unregisterShortcuts() {
        const ids = ["win-transform-ctrl", "win-transform-meta", "win-palette-ctrl", "win-palette-meta", "win-bookmarks-ctrl", "win-bookmarks-meta", "win-settings-ctrl", "win-settings-meta", "win-help"];
        ids.forEach((id) => shortcutManager.unregister(id));
    }

    onMount(() => {
        let unlisten: (() => void) | undefined;
        appWindow.isMaximized().then((m) => (isMaximized = m));

        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
            })
            .then((u) => (unlisten = u));

        registerShortcuts();

        const handleOpenShortcuts = () => {
            showShortcutsModal = true;
        };
        window.addEventListener("open-shortcuts", handleOpenShortcuts);

        return () => {
            if (unlisten) unlisten();
            window.removeEventListener("open-shortcuts", handleOpenShortcuts);
            unregisterShortcuts();
        };
    });

    async function closeApp() {
        await appWindow.close();
    }
</script>

<div class="h-9 flex items-center select-none w-full border-b shrink-0 bg-bg-titlebar border-border-main" style="transform: translateZ(0);" data-tauri-drag-region>
    <div class="flex items-center px-3 gap-3 pointer-events-auto">
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto outline-none" onclick={() => (showAboutModal = true)} use:tooltip={"About MarkdownRS"}>
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        </button>
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-fg-muted outline-none" onclick={() => (showSettingsModal = true)} use:tooltip={"Settings (Ctrl+,)"}>
            <Settings size={14} />
        </button>
    </div>

    <div class="flex-1 flex items-center justify-center px-8 pointer-events-auto gap-2" data-tauri-drag-region>
        <button class="flex items-center justify-center hover:bg-white/10 rounded p-1.5 text-fg-muted transition-colors border-none outline-none" onclick={() => (showCommandPalette = true)} use:tooltip={"Commands (Ctrl+P)"}>
            <Zap size={14} />
        </button>
        <button class="flex items-center justify-center hover:bg-white/10 rounded p-1.5 text-fg-muted transition-colors border-none outline-none" onclick={() => (showBookmarksModal = true)} use:tooltip={"Bookmarks (Ctrl+B)"}>
            <Bookmark size={14} />
        </button>
    </div>

    <div class="flex h-full pointer-events-auto items-center">
        <button class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors outline-none text-fg-muted" class:opacity-50={!isMarkdown} class:cursor-not-allowed={!isMarkdown} onclick={toggleSplit} use:tooltip={isMarkdown ? "Toggle Split Preview (Ctrl+\\)" : "Preview not available"}>
            {#if !isMarkdown}
                <EyeOff size={14} class="opacity-50" />
            {:else}
                <Eye size={14} class={appContext.app.splitView ? "text-fg-default" : "opacity-50"} />
            {/if}
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-fg-muted outline-none" onclick={() => appWindow.minimize()} use:tooltip={"Minimize"}><Minus size={16} /></button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-fg-muted" onclick={() => appWindow.toggleMaximize()} use:tooltip={"Maximize / Restore"}>
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-danger hover:text-white text-fg-muted outline-none" onclick={closeApp} use:tooltip={"Close"}><X size={16} /></button>
    </div>
</div>

<CommandPalette bind:isOpen={showCommandPalette} {commands} onClose={() => (showCommandPalette = false)} />
<SettingsModal bind:isOpen={showSettingsModal} onClose={() => (showSettingsModal = false)} />
<AboutModal bind:isOpen={showAboutModal} onClose={() => (showAboutModal = false)} />
<BookmarksModal
    bind:isOpen={showBookmarksModal}
    onClose={() => (showBookmarksModal = false)}
    onOpenFile={async (path) => {
        const { openFileByPath } = await import("$lib/utils/fileSystem");
        openFileByPath(path);
    }}
/>
<TextTransformModal isOpen={showTransformModal} onClose={() => (showTransformModal = false)} />
<ShortcutsModal bind:isOpen={showShortcutsModal} onClose={() => (showShortcutsModal = false)} />
