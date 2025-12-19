<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import CustomScrollbar from "$lib/components/ui/CustomScrollbar.svelte";
    import { editorStore } from "$lib/stores/editorStore.svelte.ts";
    import { FileText } from "lucide-svelte";
    import { tick } from "svelte";

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onSelect: (tabId: string) => void;
        selectedId: string | null;
    }

    let { isOpen, onClose, onSelect, selectedId }: Props = $props();
    let listContainerRef = $state<HTMLDivElement | null>(null);

    let mruTabs = $derived(editorStore.mruStack.map((id) => editorStore.tabs.find((t) => t.id === id)).filter((t) => t !== undefined));

    $effect(() => {
        if (isOpen && selectedId && listContainerRef) {
            const index = mruTabs.findIndex((t) => t.id === selectedId);
            if (index >= 0) {
                tick().then(() => {
                    const buttons = listContainerRef?.querySelectorAll("button");
                    const target = buttons?.[index];
                    if (target) {
                        target.scrollIntoView({
                            block: "nearest",
                            behavior: "smooth",
                        });
                    }
                });
            }
        }
    });

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) onClose();
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[100] flex items-center justify-center" style="background-color: var(--color-bg-backdrop);" onclick={handleBackdropClick}>
        <div class="w-[500px] max-h-[400px] rounded-lg shadow-2xl border overflow-hidden flex flex-col" style="background-color: var(--color-bg-panel); border-color: var(--color-border-light);">
            <div class="px-4 py-3 border-b shrink-0" style="background-color: var(--color-bg-header); border-color: var(--color-border-light);">
                <h3 class="text-sm font-semibold" style="color: var(--color-fg-default);">Recent Tabs</h3>
                <p class="text-ui-sm mt-1" style="color: var(--color-fg-muted);">Release Ctrl to switch</p>
            </div>

            <div class="flex-1 relative overflow-hidden flex flex-col min-h-0">
                <div bind:this={listContainerRef} class="flex-1 overflow-y-auto py-1 no-scrollbar">
                    {#each mruTabs as tab, index}
                        {@const isSelected = tab.id === selectedId}
                        <button
                            type="button"
                            class="w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors shrink-0"
                            style="
                                background-color: {isSelected ? 'var(--color-accent-primary)' : 'transparent'};
                                color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-fg-default)'};
                            "
                            onclick={() => {
                                onSelect(tab.id);
                                onClose();
                            }}
                        >
                            <div
                                class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                                style="
                                    background-color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-accent-secondary)'};
                                    color: {isSelected ? 'var(--color-accent-primary)' : 'var(--color-fg-inverse)'};
                                "
                            >
                                {index + 1}
                            </div>

                            <FileText size={14} class="shrink-0" style="color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-accent-file)'}" />

                            <div class="flex-1 min-w-0">
                                <div class="truncate font-medium">{tab.title}</div>
                                {#if tab.path}
                                    <div class="text-[11px] truncate opacity-70" style="color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-fg-muted)'};">{tab.path}</div>
                                {/if}
                            </div>

                            {#if tab.isDirty}
                                <div class="w-2 h-2 rounded-full shrink-0" style="background-color: {isSelected ? 'var(--color-fg-inverse)' : 'var(--color-accent-secondary)'};" use:tooltip={"Modified"}></div>
                            {/if}
                        </button>
                    {/each}
                </div>
                {#if listContainerRef}
                    <CustomScrollbar viewport={listContainerRef} />
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .no-scrollbar {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
</style>
