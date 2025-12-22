<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { callBackend } from "$lib/utils/backend";
    import { openFile, openFileByPath, persistSession, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Bookmark, Copy, Eye, Minus, Search, Settings, Square, X } from "lucide-svelte";
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

    const commands: Command[] = [
        {
            id: "new",
            label: "File: New File",
            shortcut: "Ctrl+N",
            action: () => {
                const id = editorStore.addTab();
                appState.activeTabId = id;
            },
        },
        { id: "open", label: "File: Open File", shortcut: "Ctrl+O", action: () => openFile() },
        { id: "save", label: "File: Save", shortcut: "Ctrl+S", action: () => saveCurrentFile() },
        {
            id: "toggle-split",
            label: "View: Toggle Split Preview",
            shortcut: "Ctrl+\\",
            action: () => {
                appState.toggleSplitView();
                saveSettings();
            },
        },
        { id: "format", label: "Format: Format Document", shortcut: "Shift+Alt+F", action: () => editorStore.performTextTransform("format-document") },
        { id: "ops-sort", label: "Edit: Sort Lines (A→Z)", action: () => editorStore.performTextTransform("sort-asc") },
        { id: "ops-sort-desc", label: "Edit: Sort Lines (Z→A)", action: () => editorStore.performTextTransform("sort-desc") },
        { id: "ops-trim", label: "Edit: Trim Whitespace", action: () => editorStore.performTextTransform("trim-whitespace") },
        { id: "ops-upper", label: "Edit: To UPPERCASE", action: () => editorStore.performTextTransform("uppercase") },
        { id: "ops-lower", label: "Edit: To lowercase", action: () => editorStore.performTextTransform("lowercase") },
        { id: "ops-title", label: "Edit: To Title Case", action: () => editorStore.performTextTransform("title-case") },
        { id: "ops-remove-dupes", label: "Edit: Remove Duplicate Lines", action: () => editorStore.performTextTransform("remove-duplicates") },
        { id: "ops-remove-blank", label: "Edit: Remove Blank Lines", action: () => editorStore.performTextTransform("remove-blank") },
        {
            id: "theme-dark",
            label: "Theme: Dark",
            action: () => {
                appState.setTheme("dark");
                saveSettings();
            },
        },
        {
            id: "theme-light",
            label: "Theme: Light",
            action: () => {
                appState.setTheme("light");
                saveSettings();
            },
        },
        {
            id: "close",
            label: "File: Close Tab",
            shortcut: "Ctrl+W",
            action: () => {
                if (appState.activeTabId) requestCloseTab(appState.activeTabId);
            },
        },
        {
            id: "settings",
            label: "Open Settings",
            action: () => {
                showSettingsModal = true;
            },
        },
        {
            id: "shortcuts",
            label: "Keyboard Shortcuts",
            shortcut: "F1",
            action: () => {
                showShortcutsModal = true;
            },
        },
        {
            id: "bookmarks",
            label: "Bookmarks",
            shortcut: "Ctrl+B",
            action: () => {
                showBookmarksModal = true;
            },
        },
        {
            id: "transform",
            label: "Edit: Text Transformations...",
            shortcut: "Ctrl+T",
            action: () => {
                showTransformModal = true;
            },
        },
    ];

    onMount(() => {
        let unlisten: (() => void) | undefined;
        appWindow.isMaximized().then((m) => (isMaximized = m));

        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
            })
            .then((u) => (unlisten = u));

        const handleKeydown = (e: KeyboardEvent) => {
            const isModifier = e.ctrlKey || e.metaKey;
            if (isModifier && e.key.toLowerCase() === "t") {
                e.preventDefault();
                showTransformModal = true;
            }
            if (isModifier && e.key.toLowerCase() === "p") {
                e.preventDefault();
                showCommandPalette = true;
            }
            if (isModifier && e.key.toLowerCase() === "b") {
                e.preventDefault();
                showBookmarksModal = true;
            }
            if (e.key === "F1") {
                e.preventDefault();
                showShortcutsModal = true;
            }
        };

        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("open-shortcuts", () => {
            showShortcutsModal = true;
        });

        return () => {
            if (unlisten) unlisten();
            window.removeEventListener("keydown", handleKeydown);
        };
    });

    async function closeApp() {
        try {
            await persistSession();
            await saveSettings();
            await callBackend("plugin:window-state|save_window_state", {}, "Session:Save");
            await appWindow.close();
        } catch (e) {
            await appWindow.close();
        }
    }
</script>

<div class="h-9 flex items-center select-none w-full border-b shrink-0" style="background-color: var(--color-bg-titlebar); border-color: var(--color-border-main); transform: translateZ(0);" data-tauri-drag-region>
    <div class="flex items-center px-3 gap-3 pointer-events-auto">
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto outline-none" onclick={() => (showAboutModal = true)} use:tooltip={"About MarkdownRS"}>
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        </button>
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-[var(--color-fg-muted)] outline-none" onclick={() => (showSettingsModal = true)} use:tooltip={"Settings"}>
            <Settings size={14} />
        </button>
    </div>

    <div class="flex-1 flex items-center justify-center px-8 pointer-events-auto gap-2" data-tauri-drag-region>
        <button class="w-full max-w-md flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors outline-none" style="background-color: var(--color-bg-input); color: var(--color-fg-muted); border: 1px solid var(--color-border-main);" onclick={() => (showCommandPalette = true)} use:tooltip={"Open Command Palette (Ctrl+P)"}>
            <Search size={12} />
            <span class="flex-1 text-left">Search commands...</span>
            <span class="text-[10px] opacity-60">Ctrl+P</span>
        </button>
        <button class="flex items-center justify-center hover:bg-white/10 rounded p-1.5 text-[var(--color-fg-muted)] transition-colors border-none outline-none" onclick={() => (showBookmarksModal = true)} use:tooltip={"Bookmarks (Ctrl+B)"}>
            <Bookmark size={14} />
        </button>
    </div>

    <div class="flex h-full pointer-events-auto items-center">
        <button
            class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors outline-none"
            style="color: var(--color-fg-muted);"
            onclick={() => {
                appState.toggleSplitView();
                saveSettings();
            }}
            use:tooltip={"Toggle Split Preview (Ctrl+\\)"}
        >
            <Eye size={14} class={appState.splitView ? "text-[var(--color-fg-default)]" : "opacity-50"} />
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--color-fg-muted)] outline-none" onclick={() => appWindow.minimize()} use:tooltip={"Minimize"}><Minus size={16} /></button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--color-fg-muted)]" onclick={() => appWindow.toggleMaximize()} use:tooltip={"Maximize / Restore"}>
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-[var(--color-danger)] hover:text-white text-[var(--color-fg-muted)] outline-none" onclick={closeApp} use:tooltip={"Close"}><X size={16} /></button>
    </div>
</div>

<CommandPalette bind:isOpen={showCommandPalette} {commands} />
<SettingsModal bind:isOpen={showSettingsModal} onClose={() => (showSettingsModal = false)} />
<AboutModal bind:isOpen={showAboutModal} onClose={() => (showAboutModal = false)} />
<BookmarksModal bind:isOpen={showBookmarksModal} onClose={() => (showBookmarksModal = false)} onOpenFile={openFileByPath} />
<TextTransformModal isOpen={showTransformModal} onClose={() => (showTransformModal = false)} />
<ShortcutsModal bind:isOpen={showShortcutsModal} onClose={() => (showShortcutsModal = false)} />
