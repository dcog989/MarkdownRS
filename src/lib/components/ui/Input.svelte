<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";

let {
  value = $bindable(),
  ref = $bindable(),
  class: className = "",
  type = "text",
  focusDelay,
  ...rest
}: HTMLInputAttributes & { ref?: HTMLInputElement; focusDelay?: number } = $props();

$effect(() => {
  if (focusDelay === undefined || !ref) return;
  const timer = setTimeout(() => ref?.focus(), focusDelay);
  return () => clearTimeout(timer);
});
</script>

<input bind:this={ref} bind:value {type} class="text-ui w-full disabled:opacity-50 {className}" {...rest}>
