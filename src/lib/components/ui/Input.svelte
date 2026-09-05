<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";
import { focusOnMount } from "$lib/utils/dom";

let {
  value = $bindable(),
  ref = $bindable(),
  class: className = "",
  type = "text",
  focusDelay,
  ...rest
} = $props<HTMLInputAttributes & { ref?: HTMLInputElement; focusDelay?: number }>();
</script>

<input
  use:focusOnMount={focusDelay}
  bind:this={ref}
  bind:value
  {type}
  class="text-ui bg-bg-input text-fg-default focus:border-accent-primary placeholder:text-fg-muted/50 w-full rounded border px-2 py-1 transition-colors outline-none disabled:opacity-50 {className}"
  {...rest}
>
