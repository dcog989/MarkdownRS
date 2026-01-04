<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";

    let { value = $bindable(), ref = $bindable(), class: className = "", type = "text", ...rest } = $props<HTMLInputAttributes & { ref?: HTMLInputElement }>();
</script>

<input bind:this={ref} bind:value {type} class="w-full px-2 py-1 rounded text-ui outline-none border transition-colors bg-bg-input text-fg-default border-border-main focus:border-accent-primary disabled:opacity-50 placeholder:text-fg-muted/50 {className}" {...rest} />
