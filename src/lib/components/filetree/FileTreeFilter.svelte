<script lang="ts">
import { LoaderCircle, Search, X } from "lucide-svelte";
import { _ } from "svelte-i18n";

let { value = $bindable(""), loading = false } = $props<{
  value?: string;
  loading?: boolean;
}>();
</script>

<div class="ft-filter border-border-secondary shrink-0 border-b">
  <span class="ft-filter-icon">
    {#if loading}
      <LoaderCircle size={13} class="animate-spin" />
    {:else}
      <Search size={13} />
    {/if}
  </span>
  <input
    type="text"
    class="ft-filter-input"
    bind:value
    placeholder={$_("fileTree.filterPlaceholder")}
    aria-label={$_("fileTree.filterPlaceholder")}
  >
  {#if value}
    <button
      type="button"
      class="hover-surface ft-filter-clear"
      aria-label={$_("fileTree.clearFilter")}
      title={$_("fileTree.clearFilter")}
      onclick={() => (value = "")}
    >
      <X size={12} />
    </button>
  {/if}
</div>

<style>
.ft-filter {
  position: relative;
}

.ft-filter-icon {
  position: absolute;
  top: 50%;
  left: 0.875rem;
  transform: translateY(-50%);
  display: flex;
  color: var(--text-secondary);
  pointer-events: none;
}

.ft-filter-input {
  width: 100%;
  padding: 0.25rem 1.75rem 0.25rem 2rem;
  font-size: 0.75rem;
  outline: none;
}

.ft-filter-clear {
  position: absolute;
  top: 50%;
  right: 0.875rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  color: var(--text-secondary);
}
</style>
