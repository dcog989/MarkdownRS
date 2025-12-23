<script lang="ts">
    /**
     * Unified Command Palette Component
     * Handles keyboard navigation, filtering, and execution of app-wide commands.
     */
    import { tick } from "svelte";

    export type Command = {
        id: string;
        label: string;
        shortcut?: string;
        action: () => void;
    };

    let { isOpen = $bindable(false), commands = [] } = $props<{
        isOpen: boolean;
        commands: Command[];
    }>();

    let query = $state("");
    let inputRef: HTMLInputElement | undefined = $state();
    let selectedIndex = $state(0);

    let filteredCommands = $derived(commands.filter((c: Command) => c.label.toLowerCase().includes(query.toLowerCase())));

    $effect(() => {
        if (isOpen) {
            query = "";
            selectedIndex = 0;
            tick().then(() => inputRef?.focus());
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredCommands.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
        } else if (e.key === "Enter") {
            e.preventDefault();
            execute(filteredCommands[selectedIndex]);
        } else if (e.key === "Escape") {
            e.preventDefault();
            isOpen = false;
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
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-start justify-center pt-16" style="background-color: var(--color-bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-[600px] max-w-[90vw] rounded-lg shadow-2xl border overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);">
            <div class="p-2 border-b shrink-0" style="border-color: var(--color-border-light);">
                <input bind:this={inputRef} bind:value={query} class="w-full bg-transparent outline-none px-2 py-1 text-ui placeholder-opacity-50" style="color: var(--color-fg-default);" placeholder="Type a command..." onkeydown={handleKeydown} />
            </div>
            <div class="overflow-y-auto py-1 custom-scrollbar">
                {#if filteredCommands.length > 0}
                    {#each filteredCommands as command, index}
                        <button
                            type="button"
                            class="w-full text-left px-3 py-2 text-ui flex justify-between items-center outline-none"
                            style="
                                background-color: {index === selectedIndex ? 'var(--color-accent-primary)' : 'transparent'};
                                color: {index === selectedIndex ? 'var(--color-fg-inverse)' : 'var(--color-fg-default)'};
                            "
                            onmouseenter={() => (selectedIndex = index)}
                            onclick={() => execute(command)}
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
