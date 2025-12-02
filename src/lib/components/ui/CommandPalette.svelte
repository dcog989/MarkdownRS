<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { openFile, saveCurrentFile } from "$lib/utils/fileSystem";
    import { onDestroy, onMount } from "svelte";

    let isOpen = $state(false);
    let query = $state("");
    let inputRef: HTMLInputElement;
    let selectedIndex = $state(0);

    type Command = {
        id: string;
        label: string;
        shortcut?: string;
        action: () => void;
    };

    const commands: Command[] = [
        { id: "new", label: "File: New File", shortcut: "Ctrl+N", action: () => editorStore.addTab() },
        { id: "open", label: "File: Open File", shortcut: "Ctrl+O", action: () => openFile() },
        { id: "save", label: "File: Save", shortcut: "Ctrl+S", action: () => saveCurrentFile() },
        { id: "toggle-split", label: "View: Toggle Split Preview", shortcut: "Ctrl+\\", action: () => appState.toggleSplitView() },
        { id: "theme-dark", label: "Theme: Dark", action: () => appState.setTheme("dark") },
        { id: "theme-light", label: "Theme: Light", action: () => appState.setTheme("light") },
        {
            id: "close",
            label: "File: Close Tab",
            shortcut: "Ctrl+W",
            action: () => {
                if (appState.activeTabId) editorStore.closeTab(appState.activeTabId);
            },
        },
    ];

    let filteredCommands = $derived(commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())));

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            isOpen = !isOpen;
            if (isOpen) {
                setTimeout(() => inputRef?.focus(), 50);
                query = "";
                selectedIndex = 0;
            }
        } else if (e.key === "Escape" && isOpen) {
            isOpen = false;
        } else if (isOpen) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % filteredCommands.length;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
            } else if (e.key === "Enter") {
                e.preventDefault();
                execute(filteredCommands[selectedIndex]);
            }
        }
    }

    function execute(command: Command) {
        if (!command) return;
        command.action();
        isOpen = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            isOpen = false;
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("keydown", handleKeydown);
        }
    });
</script>
