<script lang="ts">
    import Input from '$lib/components/ui/Input.svelte';
    import { Search, X } from 'lucide-svelte';
    import type { Snippet } from 'svelte';

    let {
        title,
        icon: Icon,
        searchValue = $bindable(''),
        searchPlaceholder = 'Search...',
        inputRef = $bindable(),
        onClose,
        onKeydown,
        extraActions,
    } = $props<{
        title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        icon: any; // Lucide icon component
        searchValue: string;
        searchPlaceholder?: string;
        inputRef?: HTMLInputElement;
        onClose: () => void;
        onKeydown?: (e: KeyboardEvent) => void;
        extraActions?: Snippet;
    }>();
</script>

<div class="flex w-full items-center gap-4">
    <div class="flex shrink-0 items-center gap-2">
        <Icon size={16} class="text-accent-secondary" />
        <h2 class="text-ui text-fg-default font-semibold">{title}</h2>
    </div>

    <div class="relative flex-1 min-w-0">
        <Input
            bind:ref={inputRef}
            bind:value={searchValue}
            type="text"
            class="w-full px-2"
            onkeydown={onKeydown} />

        {#if !searchValue}
            <div
                class="pointer-events-none absolute inset-0 flex items-center px-2 text-fg-muted opacity-50">
                <Search size={16} class="mx-2 shrink-0" />
                <span class="truncate text-sm">{searchPlaceholder}</span>
            </div>
        {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2">
        {#if extraActions}
            {@render extraActions()}
        {/if}

        <button
            class="text-fg-muted hover-surface hover:text-danger rounded p-1 transition-colors outline-none"
            onclick={onClose}
            aria-label="Close">
            <X size={16} />
        </button>
    </div>
</div>
