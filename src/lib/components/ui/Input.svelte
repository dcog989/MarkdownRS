<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    let {
        value = $bindable(),
        ref = $bindable(),
        class: className = '',
        type = 'text',
        ...rest
    } = $props<HTMLInputAttributes & { ref?: HTMLInputElement }>();
</script>

<input
    bind:this={ref}
    bind:value
    {type}
    class="text-ui bg-bg-input text-fg-default border-border-main focus:border-accent-primary placeholder:text-fg-muted/50 w-full rounded border px-2 py-1 transition-colors outline-none disabled:opacity-50 {className}"
    {...rest} />
