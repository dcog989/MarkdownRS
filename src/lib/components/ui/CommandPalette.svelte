<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { openFile, saveCurrentFile } from "$lib/utils/fileSystem.ts";
    import { onDestroy, onMount } from "svelte";

    let isOpen = $state(false);
    let query = $state("");
    let inputRef: HTMLInputElement | undefined = $state();
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
                // Small timeout to allow DOM to render before focusing
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

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50" onclick={handleBackdropClick}>
        <div class="w-[600px] bg-[#252526] rounded-lg shadow-2xl border border-[#454545] overflow-hidden flex flex-col max-h-[60vh]">
            <div class="p-2 border-b border-[#454545]">
                <input bind:this={inputRef} bind:value={query} class="w-full bg-transparent text-white placeholder-gray-400 outline-none px-2 py-1 text-sm" placeholder="Type a command..." />
            </div>
            <div class="overflow-y-auto py-1">
                {#if filteredCommands.length > 0}
                    {#each filteredCommands as command, index}
                        <button
                            type="button"
                            class="w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-[#2a2d2e]
                            {index === selectedIndex ? 'bg-[#094771] text-white hover:bg-[#094771]' : 'text-[#cccccc]'}"
                            onclick={() => execute(command)}
                        >
                            <span>{command.label}</span>
                            {#if command.shortcut}
                                <span class="text-xs opacity-60">{command.shortcut}</span>
                            {/if}
                        </button>
                    {/each}
                {:else}
                    <div class="px-3 py-2 text-sm text-gray-500">No commands found</div>
                {/if}
            </div>
        </div>
    </div>
{/if}
