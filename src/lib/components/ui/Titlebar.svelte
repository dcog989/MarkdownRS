<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { openFile, persistSession, requestCloseTab, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { saveSettings } from "$lib/utils/settings";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { Copy, Eye, Minus, Search, Settings, Square, X } from "lucide-svelte";
    import { onMount } from "svelte";
    import AboutModal from "./AboutModal.svelte";
    import SettingsModal from "./SettingsModal.svelte";
    import ShortcutsModal from "./ShortcutsModal.svelte";
    import TextTransformModal from "./TextTransformModal.svelte";

    const appWindow = getCurrentWindow();
    let isMaximized = $state(false);
    let showSettingsModal = $state(false);
    let showAboutModal = $state(false);
    let showTransformModal = $state(false);
    let showShortcutsModal = $state(false);
    let showCommandPalette = $state(false);
    let commandSearchQuery = $state("");
    let commandInputRef: HTMLInputElement | undefined = $state();
    let selectedCommandIndex = $state(0);

    type Command = {
        id: string;
        label: string;
        shortcut?: string;
        action: () => void;
    };

    const commands: Command[] = [
        {
            id: "new",
            label: "File: New File",
            shortcut: "Ctrl+N",
            action: () => {
                const id = editorStore.addTab();
                appState.activeTabId = id;
                showCommandPalette = false;
            },
        },
        {
            id: "open",
            label: "File: Open File",
            shortcut: "Ctrl+O",
            action: () => {
                openFile();
                showCommandPalette = false;
            },
        },
        {
            id: "save",
            label: "File: Save",
            shortcut: "Ctrl+S",
            action: () => {
                saveCurrentFile();
                showCommandPalette = false;
            },
        },
        {
            id: "toggle-split",
            label: "View: Toggle Split Preview",
            shortcut: "Ctrl+\\",
            action: () => {
                appState.toggleSplitView();
                showCommandPalette = false;
            },
        },
        {
            id: "transform",
            label: "Edit: Text Transformations...",
            shortcut: "Ctrl+T",
            action: () => {
                showTransformModal = true;
                showCommandPalette = false;
            },
        },
        {
            id: "theme-dark",
            label: "Theme: Dark",
            action: () => {
                appState.setTheme("dark");
                saveSettings();
                showCommandPalette = false;
            },
        },
        {
            id: "theme-light",
            label: "Theme: Light",
            action: () => {
                appState.setTheme("light");
                saveSettings();
                showCommandPalette = false;
            },
        },
        {
            id: "close",
            label: "File: Close Tab",
            shortcut: "Ctrl+W",
            action: () => {
                if (appState.activeTabId) requestCloseTab(appState.activeTabId);
                showCommandPalette = false;
            },
        },
        {
            id: "settings",
            label: "Open Settings",
            action: () => {
                showSettingsModal = true;
                showCommandPalette = false;
            },
        },
        {
            id: "shortcuts",
            label: "Keyboard Shortcuts",
            shortcut: "F1",
            action: () => {
                showShortcutsModal = true;
                showCommandPalette = false;
            },
        },
    ];

    const opsCommands: Command[] = [
        {
            id: "ops-sort",
            label: "Edit: Sort Lines (A-Z)",
            action: () => {
                editorStore.performTextTransform('sort-asc');
                showCommandPalette = false;
            },
        },
        {
            id: "ops-trim",
            label: "Edit: Trim Whitespace",
            action: () => {
                editorStore.performTextTransform('trim-whitespace');
                showCommandPalette = false;
            },
        },
        {
            id: "ops-upper",
            label: "Edit: To Upper Case",
            action: () => {
                editorStore.performTextTransform('uppercase');
                showCommandPalette = false;
            },
        },
        {
            id: "ops-lower",
            label: "Edit: To Lower Case",
            action: () => {
                editorStore.performTextTransform('lowercase');
                showCommandPalette = false;
            },
        },
    ];
    const allCommands = [...commands, ...opsCommands];

    let filteredCommands = $derived(allCommands.filter((c) => c.label.toLowerCase().includes(commandSearchQuery.toLowerCase())));

    onMount(() => {
        let unlisten: (() => void) | undefined;
        appWindow.isMaximized().then((m) => (isMaximized = m));

        appWindow
            .onResized(async () => {
                isMaximized = await appWindow.isMaximized();
            })
            .then((u) => (unlisten = u));

        const handleKeydown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
                e.preventDefault();
                showTransformModal = true;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
                e.preventDefault();
                openCommandPalette();
            }
            if (e.key === "F1") {
                e.preventDefault();
                showShortcutsModal = true;
            }
        };

        const handleOpenShortcuts = () => {
            showShortcutsModal = true;
        };

        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("open-shortcuts", handleOpenShortcuts);

        return () => {
            if (unlisten) unlisten();
            window.removeEventListener("keydown", handleKeydown);
            window.removeEventListener("open-shortcuts", handleOpenShortcuts);
        };
    });

    function minimize() {
        appWindow.minimize();
    }

    async function toggleMaximize() {
        await appWindow.toggleMaximize();
        isMaximized = await appWindow.isMaximized();
    }

    async function closeApp() {
        try {
            await persistSession();
            await saveSettings();

            // Explicitly trigger window state save
            await invoke("plugin:window-state|save_window_state");

            await appWindow.close();
        } catch (e) {
            console.error(`Error during shutdown: ${e}`);
            await appWindow.close();
        }
    }

    function openCommandPalette() {
        showCommandPalette = true;
        commandSearchQuery = "";
        selectedCommandIndex = 0;
        setTimeout(() => commandInputRef?.focus(), 50);
    }

    function executeCommand(command: Command) {
        if (!command) return;
        command.action();
    }

    function handleCommandKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
        } else if (e.key === "Enter") {
            e.preventDefault();
            executeCommand(filteredCommands[selectedCommandIndex]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            showCommandPalette = false;
        }
    }

    function handleCommandBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            showCommandPalette = false;
        }
    }
</script>

<div class="h-9 flex items-center select-none w-full border-b shrink-0" style="background-color: var(--color-bg-titlebar); border-color: var(--color-border-main); transform: translateZ(0);" data-tauri-drag-region>
    <!-- Logo / Settings -->
    <div class="flex items-center px-3 gap-3 pointer-events-auto">
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto" onclick={() => (showAboutModal = true)} use:tooltip={"About MarkdownRS"}>
            <img src="/logo.svg" alt="Logo" class="h-4 w-4" />
        </button>
        <button class="hover:bg-white/10 rounded p-1 pointer-events-auto text-[var(--color-fg-muted)]" onclick={() => (showSettingsModal = true)} use:tooltip={"Settings"}>
            <Settings size={14} />
        </button>
    </div>

    <!-- Command Palette Search (Center) -->
    <div class="flex-1 flex items-center justify-center px-8 pointer-events-auto" data-tauri-drag-region>
        <button class="w-full max-w-md flex items-center gap-2 px-3 py-1 rounded text-xs transition-colors" style="background-color: var(--color-bg-input); color: var(--color-fg-muted); border: 1px solid var(--color-border-main);" onclick={openCommandPalette} use:tooltip={"Open Command Palette (Ctrl+P)"}>
            <Search size={12} />
            <span class="flex-1 text-left">Search commands...</span>
            <span class="text-[10px] opacity-60">Ctrl+P</span>
        </button>
    </div>

    <!-- Controls -->
    <div class="flex h-full pointer-events-auto items-center">
        <button
            class="h-full px-3 flex items-center justify-center hover:bg-white/10 focus:outline-none transition-colors border-r"
            style="color: var(--color-fg-muted); border-color: var(--color-border-main);"
            onclick={() => {
                appState.toggleSplitView();
                saveSettings();
            }}
            use:tooltip={"Toggle Split Preview (Ctrl+\\)"}
        >
            <Eye size={14} class={appState.splitView ? "text-[var(--color-fg-default)]" : "opacity-50"} />
        </button>

        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--color-fg-muted)]" onclick={minimize} use:tooltip={"Minimize"}><Minus size={16} /></button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-white/10 text-[var(--color-fg-muted)]" onclick={toggleMaximize} use:tooltip={"Maximize / Restore"}>
            {#if isMaximized}<Copy size={14} class="rotate-180" />{:else}<Square size={14} />{/if}
        </button>
        <button class="h-full w-12 flex items-center justify-center hover:bg-[var(--color-danger)] hover:text-white text-[var(--color-fg-muted)]" onclick={closeApp} use:tooltip={"Close"}><X size={16} /></button>
    </div>
</div>

<!-- Command Palette Modal -->
{#if showCommandPalette}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" style="background-color: var(--color-bg-backdrop);" onclick={handleCommandBackdropClick}>
        <div class="w-[600px] rounded-lg shadow-2xl border overflow-hidden flex flex-col max-h-[60vh]" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);">
            <div class="p-2 border-b" style="border-color: var(--color-border-light);">
                <input bind:this={commandInputRef} bind:value={commandSearchQuery} class="w-full bg-transparent outline-none px-2 py-1 text-ui placeholder-opacity-50" style="color: var(--color-fg-default);" placeholder="Type a command..." onkeydown={handleCommandKeydown} />
            </div>
            <div class="overflow-y-auto py-1">
                {#if filteredCommands.length > 0}
                    {#each filteredCommands as command, index}
                        <button
                            type="button"
                            class="w-full text-left px-3 py-2 text-ui flex justify-between items-center"
                            style="
                                background-color: {index === selectedCommandIndex ? 'var(--color-accent-primary)' : 'transparent'};
                                color: {index === selectedCommandIndex ? 'var(--color-fg-inverse)' : 'var(--color-fg-default)'};
                            "
                            onmouseenter={() => (selectedCommandIndex = index)}
                            onclick={() => executeCommand(command)}
                        >
                            <span>{command.label}</span>
                            {#if command.shortcut}
                                <span class="text-ui-sm opacity-60">{command.shortcut}</span>
                            {/if}
                        </button>
                    {/each}
                {:else}
                    <div class="px-3 py-2 text-ui text-gray-500">No commands found</div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- Settings Modal -->
<SettingsModal bind:isOpen={showSettingsModal} onClose={() => (showSettingsModal = false)} />

<!-- About Modal -->
<AboutModal bind:isOpen={showAboutModal} onClose={() => (showAboutModal = false)} />

<!-- Text Transform Modal -->
<TextTransformModal isOpen={showTransformModal} onClose={() => (showTransformModal = false)} />

<!-- Shortcuts Modal -->
<ShortcutsModal bind:isOpen={showShortcutsModal} onClose={() => (showShortcutsModal = false)} />
