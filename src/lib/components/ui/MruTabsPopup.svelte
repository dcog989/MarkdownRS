<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { FileText } from "lucide-svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onSelect: (tabId: string) => void;
        currentActiveId: string | null;
    }

    let { isOpen, onClose, onSelect, currentActiveId }: Props = $props();

    let mruTabs = $derived(
        editorStore.mruStack
            .map((id) => editorStore.tabs.find((t) => t.id === id))
            .filter((t) => t !== undefined)
            .slice(0, 10) // Show max 10 most recent
    );

    function handleSelect(tabId: string) {
        onSelect(tabId);
        onClose();
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background-color: var(--bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-[500px] max-h-[400px] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--bg-panel); border-color: var(--border-light);">
            <!-- Header -->
            <div class="px-4 py-3 border-b" style="background-color: var(--bg-header); border-color: var(--border-light);">
                <h3 class="text-sm font-semibold" style="color: var(--fg-default);">Recent Tabs (MRU)</h3>
                <p class="text-xs mt-1" style="color: var(--fg-muted);">Press Tab again to cycle or click to select</p>
            </div>

            <!-- Tab List -->
            <div class="flex-1 overflow-y-auto py-1">
                {#each mruTabs as tab, index}
                    <button
                        type="button"
                        class="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-white/10 transition-colors"
                        style="
                            background-color: {tab.id === currentActiveId ? 'var(--accent-primary)' : 'transparent'};
                            color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--fg-default)'};
                        "
                        onclick={() => handleSelect(tab.id)}
                    >
                        <div
                            class="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold shrink-0"
                            style="
                                background-color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--accent-secondary)'};
                                color: {tab.id === currentActiveId ? 'var(--accent-primary)' : 'var(--fg-inverse)'};
                            "
                        >
                            {index + 1}
                        </div>

                        <FileText size={14} class="shrink-0" style="color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--accent-file)'}" />

                        <div class="flex-1 min-w-0">
                            <div class="truncate font-medium">{tab.title}</div>
                            {#if tab.path}
                                <div class="text-xs truncate opacity-70" style="color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--fg-muted)'};">{tab.path}</div>
                            {/if}
                        </div>

                        {#if tab.isDirty}
                            <div class="w-2 h-2 rounded-full shrink-0" style="background-color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--accent-secondary)'};" use:tooltip={"Modified"}></div>
                        {/if}

                        {#if tab.isPinned}
                            <div class="text-xs shrink-0" style="color: {tab.id === currentActiveId ? 'var(--fg-inverse)' : 'var(--accent-secondary)'}" use:tooltip={"Pinned"}>📌</div>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    </div>
{/if}
