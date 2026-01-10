<script lang="ts">
    import { OPERATION_CATEGORIES, getOperationsByCategory } from "$lib/config/textOperationsRegistry";
    import { exportService } from "$lib/services/exportService";
    import { setTheme, toggleSplitView } from "$lib/stores/appState.svelte";
    import { addTab, performTextTransform } from "$lib/stores/editorStore.svelte";
    import { toggleAbout, toggleBookmarks, toggleCommandPalette, toggleSettings, toggleShortcuts, toggleTransform } from "$lib/stores/interfaceStore.svelte";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { showToast } from "$lib/stores/toastStore.svelte";
    import { openFile, openFileByPath, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem";
    import { isMarkdownFile } from "$lib/utils/fileValidation";
    import { saveSettings } from "$lib/utils/settings";
    import { shortcutManager } from "$lib/utils/shortcuts";
    import { onMount } from "svelte";
    import AboutModal from "./AboutModal.svelte";
    import BookmarksModal from "./BookmarksModal.svelte";
    import CommandPalette, { type Command } from "./CommandPalette.svelte";
    import SettingsModal from "./SettingsModal.svelte";
    import ShortcutsModal from "./ShortcutsModal.svelte";
    import TextTransformModal from "./TextTransformModal.svelte";

    let activeTab = $derived(appContext.editor.tabs.find((t) => t.id === appContext.app.activeTabId));
    let isMarkdown = $derived(activeTab ? (activeTab.path ? isMarkdownFile(activeTab.path) : true) : true);

    function toggleSplit() {
        if (!isMarkdown) {
            showToast("warning", "Preview not available for this file type");
            return;
        }
        toggleSplitView();
        saveSettings();
    }

    const baseCommands: Command[] = [
        {
            id: "new",
            label: "File: New File",
            shortcut: "Ctrl+N",
            action: () => {
                const id = addTab();
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
            action: () => performTextTransform("format-document"),
        },
        {
            id: "theme-dark",
            label: "Theme: Dark",
            action: () => {
                setTheme("dark");
                saveSettings();
            },
        },
        {
            id: "theme-light",
            label: "Theme: Light",
            action: () => {
                setTheme("light");
                saveSettings();
            },
        },
        {
            id: "toggle-split",
            label: "View: Toggle Split Preview",
            shortcut: "Ctrl+\\",
            action: () => toggleSplit(),
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
            action: () => toggleBookmarks(),
        },
        {
            id: "settings",
            label: "Window: Settings",
            shortcut: "Ctrl+,",
            action: () => toggleSettings(),
        },
        {
            id: "shortcuts",
            label: "Window: Keyboard Shortcuts",
            shortcut: "F1",
            action: () => toggleShortcuts(),
        },
        {
            id: "transform",
            label: "Window: Text Transformations",
            shortcut: "Ctrl+T",
            action: () => toggleTransform(),
        },
        {
            id: "about",
            label: "Window: About",
            action: () => toggleAbout(),
        },
    ];

    const textOperationCommands: Command[] = OPERATION_CATEGORIES.flatMap((category) =>
        getOperationsByCategory(category.id).map((op) => ({
            id: `ops-${op.id}`,
            label: `${category.title}: ${op.label}`,
            action: () => performTextTransform(op.id),
        }))
    );

    const commands = $derived(
        [...baseCommands, ...textOperationCommands].sort((a, b) => {
            const catA = a.label.split(":")[0].trim();
            const catB = b.label.split(":")[0].trim();
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            return a.label.localeCompare(b.label);
        })
    );

    function registerShortcuts() {
        const openTransform = () => toggleTransform();
        shortcutManager.register({ id: "win-transform-ctrl", key: "t", ctrl: true, category: "Window", description: "Text Transformations", handler: openTransform });
        shortcutManager.register({ id: "win-transform-meta", key: "t", meta: true, category: "Window", description: "Text Transformations", handler: openTransform });

        const openPalette = () => toggleCommandPalette();
        shortcutManager.register({ id: "win-palette-ctrl", key: "p", ctrl: true, category: "Window", description: "Command Palette", handler: openPalette });
        shortcutManager.register({ id: "win-palette-meta", key: "p", meta: true, category: "Window", description: "Command Palette", handler: openPalette });

        const openBookmarks = () => toggleBookmarks();
        shortcutManager.register({ id: "win-bookmarks-ctrl", key: "b", ctrl: true, category: "Window", description: "Bookmarks", handler: openBookmarks });
        shortcutManager.register({ id: "win-bookmarks-meta", key: "b", meta: true, category: "Window", description: "Bookmarks", handler: openBookmarks });

        const openSettings = () => toggleSettings();
        shortcutManager.register({ id: "win-settings-ctrl", key: ",", ctrl: true, category: "Window", description: "Settings", handler: openSettings });
        shortcutManager.register({ id: "win-settings-meta", key: ",", meta: true, category: "Window", description: "Settings", handler: openSettings });

        shortcutManager.register({
            id: "win-help",
            key: "F1",
            category: "Window",
            description: "Keyboard Shortcuts",
            handler: () => toggleShortcuts(),
        });
    }

    function unregisterShortcuts() {
        const ids = ["win-transform-ctrl", "win-transform-meta", "win-palette-ctrl", "win-palette-meta", "win-bookmarks-ctrl", "win-bookmarks-meta", "win-settings-ctrl", "win-settings-meta", "win-help"];
        ids.forEach((id) => shortcutManager.unregister(id));
    }

    onMount(() => {
        registerShortcuts();
        return () => {
            unregisterShortcuts();
        };
    });
</script>

<CommandPalette bind:isOpen={appContext.interface.showCommandPalette} {commands} onClose={() => (appContext.interface.showCommandPalette = false)} />
<SettingsModal bind:isOpen={appContext.interface.showSettings} onClose={() => (appContext.interface.showSettings = false)} />
<AboutModal bind:isOpen={appContext.interface.showAbout} onClose={() => (appContext.interface.showAbout = false)} />
<BookmarksModal bind:isOpen={appContext.interface.showBookmarks} onClose={() => (appContext.interface.showBookmarks = false)} onOpenFile={(path) => openFileByPath(path)} />
<TextTransformModal isOpen={appContext.interface.showTransform} onClose={() => (appContext.interface.showTransform = false)} />
<ShortcutsModal bind:isOpen={appContext.interface.showShortcuts} onClose={() => (appContext.interface.showShortcuts = false)} />
