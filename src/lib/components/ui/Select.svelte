<script lang="ts">
import type { HTMLSelectAttributes } from "svelte/elements";

let { value = $bindable(), class: className = "", children, ...rest } = $props<HTMLSelectAttributes>();
</script>

<div class="select-wrap {className}">
  <select bind:value {...rest}>
    {@render children?.()}
  </select>
</div>
