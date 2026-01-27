<script lang="ts">
    import ModalSearchHeader from '$lib/components/ui/ModalSearchHeader.svelte';
    import { Zap } from 'lucide-svelte';
    import { tick } from 'svelte';
    import Modal from './Modal.svelte';

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

    let query = $state('');
    let inputRef: HTMLInputElement | undefined = $state();
    let selectedIndex = $state(0);

    let filteredCommands = $derived(
        commands.filter((c: Command) => c.label.toLowerCase().includes(query.toLowerCase())),
    );

    $effect(() => {
        if (isOpen) {
            query = '';
            selectedIndex = 0;
            tick().then(() => inputRef?.focus());
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % filteredCommands.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
        } else if (e.key === 'Enter') {
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
            node.scrollIntoView({ block: 'nearest' });
        }
        return {
            update(newIsSelected: boolean) {
                if (newIsSelected) {
                    node.scrollIntoView({ block: 'nearest' });
                }
            },
        };
    }
</script>

<Modal bind:isOpen {onClose}>
    {#snippet header()}
        <ModalSearchHeader
            title="Commands"
            icon={Zap}
            bind:searchValue={query}
            bind:inputRef
            searchPlaceholder="Search..."
            onClose={close}
            onKeydown={handleKeydown} />
    {/snippet}

    <div class="py-1">
        {#if filteredCommands.length > 0}
            {#each filteredCommands as command, index (command.id)}
                <button
                    type="button"
                    class="command-item text-ui flex w-full items-center justify-between px-3 py-2 text-left outline-none"
                    style="
                        background-color: {index === selectedIndex
                        ? 'var(--color-accent-primary)'
                        : 'transparent'};
                        color: {index === selectedIndex
                        ? 'var(--color-fg-inverse)'
                        : 'var(--color-fg-default)'};
                    "
                    use:scrollIntoView={index === selectedIndex}
                    onmouseenter={() => (selectedIndex = index)}
                    onclick={() => execute(command)}>
                    <span>{command.label}</span>
                    {#if command.shortcut}
                        <span class="text-ui-sm opacity-60">{command.shortcut}</span>
                    {/if}
                </button>
            {/each}
        {:else}
            <div class="text-ui text-fg-muted px-3 py-2">No commands found</div>
        {/if}
    </div>
</Modal>
