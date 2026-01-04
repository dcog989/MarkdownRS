<script lang="ts">
    import Input from "$lib/components/ui/Input.svelte";
    import { Search, X, Zap } from "lucide-svelte";
    import { tick } from "svelte";
    import Modal from "./Modal.svelte";

    export type Command = {
        id: string;
        label: string;
        shortcut?: string;
        action: () => void;
    };

    let {
        isOpen = $bindable(false),
        commands = [],
        onClose,
    } = $props<{
        isOpen: boolean;
        commands: Command[];
        onClose?: () => void;
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
        }
    }

    function execute(command: Command) {
        if (!command) return;
        command.action();
        close();
    }

    function close() {
        isOpen = false;
        if (onClose) onClose();
    }

    function scrollIntoView(node: HTMLElement, isSelected: boolean) {
        if (isSelected) {
            node.scrollIntoView({ block: "nearest" });
        }
        return {
            update(newIsSelected: boolean) {
                if (newIsSelected) {
                    node.scrollIntoView({ block: "nearest" });
                }
            },
        };
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <div class="flex items-center gap-2">
            <Zap size={16} class="text-accent-secondary" />
            <h2 class="text-ui font-semibold shrink-0 text-fg-default">Commands</h2>
        </div>

        <div class="flex-1 relative mx-4">
            <Search size={12} class="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
            <Input bind:ref={inputRef} bind:value={query} type="text" placeholder="Search..." class="pl-8 pr-3" onkeydown={handleKeydown} />
        </div>

        <button class="p-1 rounded hover:bg-white/10 transition-colors shrink-0 text-fg-muted" onclick={close}>
            <X size={16} />
        </button>
    {/snippet}

    <div class="py-1">
        {#if filteredCommands.length > 0}
            {#each filteredCommands as command, index}
                <button
                    type="button"
                    class="command-item w-full text-left px-3 py-2 text-ui flex justify-between items-center outline-none"
                    style="
                        background-color: {index === selectedIndex ? 'var(--color-accent-primary)' : 'transparent'};
                        color: {index === selectedIndex ? 'var(--color-fg-inverse)' : 'var(--color-fg-default)'};
                    "
                    use:scrollIntoView={index === selectedIndex}
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
            <div class="px-3 py-2 text-ui text-fg-muted">No commands found</div>
        {/if}
    </div>
</Modal>
