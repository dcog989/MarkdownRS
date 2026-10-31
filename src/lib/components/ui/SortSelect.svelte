<script lang="ts" generics="T extends string">
import ArrowDown from "lucide-svelte/icons/arrow-down";
import ArrowUp from "lucide-svelte/icons/arrow-up";
import { _ } from "svelte-i18n";

let {
  value = $bindable(),
  options,
  direction,
  onToggleDirection,
  title,
}: {
  value: T;
  options: { value: T; label: string }[];
  direction: "asc" | "desc";
  onToggleDirection: () => void;
  title?: string;
} = $props();
</script>

<div class="flex shrink-0 items-center gap-1">
  <select bind:value class="w-auto" {title}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <button
    type="button"
    onclick={onToggleDirection}
    class="btn-icon"
    title={direction === "asc" ? $_("common.sortAscending") : $_("common.sortDescending")}
  >
    {#if direction === "asc"}
      <ArrowUp size={16} />
    {:else}
      <ArrowDown size={16} />
    {/if}
  </button>
</div>
