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
        <Search
            size={14}
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 opacity-50" />
        <Input
            bind:ref={inputRef}
            bind:value={searchValue}
            type="text"
            placeholder={searchPlaceholder}
            class="w-full pl-12 pr-3"
            onkeydown={onKeydown} />
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
