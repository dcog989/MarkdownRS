<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import CustomScrollbar from '$lib/components/ui/CustomScrollbar.svelte';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { CircleAlert, FileText, PencilLine, SquarePen } from 'lucide-svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        onSelect: (tabId: string) => void;
        selectedId: string | null;
    }

    let { isOpen, onClose, onSelect, selectedId }: Props = $props();
    let listContainerRef = $state<HTMLDivElement | null>(null);

    let mruTabs = $derived(
        appContext.editor.mruStack
            .map((id) => appContext.editor.tabs.find((t) => t.id === id))
            .filter((t) => t !== undefined),
    );

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) onClose();
    }

    function scrollIntoView(node: HTMLElement, isSelected: boolean) {
        if (isSelected) {
            node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return {
            update(newIsSelected: boolean) {
                if (newIsSelected) {
                    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            },
        };
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ui-backdrop" onclick={handleBackdropClick}>
        <div class="ui-panel">
            <div class="ui-header">
                <h3 class="text-sm font-semibold text-fg-default">Recent Tabs</h3>
                <p class="text-ui-sm mt-1 text-fg-muted">Release Ctrl to switch</p>
            </div>

            <div class="flex-1 relative overflow-hidden flex flex-col min-h-0">
                <div bind:this={listContainerRef} class="flex-1 overflow-y-auto py-1 no-scrollbar">
                    {#each mruTabs as tab, index}
                        {@const isSelected = tab.id === selectedId}
                        <button
                            type="button"
                            class="mru-item"
                            data-selected={isSelected}
                            use:scrollIntoView={isSelected}
                            onclick={() => {
                                onSelect(tab.id);
                                onClose();
                            }}>
                            <div class="mru-badge">
                                {index + 1}
                            </div>

                            {#if tab.fileCheckFailed}
                                <div class="mru-icon text-danger-text">
                                    <CircleAlert size={14} class="shrink-0" />
                                </div>
                            {:else if tab.path && tab.isDirty}
                                <div class="mru-icon" style="--icon-color: #5deb47">
                                    <SquarePen size={14} class="shrink-0" />
                                </div>
                            {:else if !tab.path}
                                <div class="mru-icon text-accent-file">
                                    <PencilLine size={14} class="shrink-0" />
                                </div>
                            {:else}
                                <div class="mru-icon text-accent-file">
                                    <FileText size={14} class="shrink-0" />
                                </div>
                            {/if}

                            <div class="flex-1 min-w-0">
                                <div class="truncate font-medium">{tab.title}</div>
                                {#if tab.path}
                                    <div class="mru-path">{tab.path}</div>
                                {/if}
                            </div>

                            {#if tab.isDirty}
                                <div class="mru-dot" use:tooltip={'Modified'}></div>
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
