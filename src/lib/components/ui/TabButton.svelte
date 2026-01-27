<script lang="ts">
    import { tooltip } from '$lib/actions/tooltip';
    import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
    import { appContext } from '$lib/stores/state.svelte.ts';
    import { formatFileSize } from '$lib/utils/fileValidation';
    import { CircleAlert, FileText, Pencil, PencilLine, Pin, SquarePen, X } from 'lucide-svelte';

    interface Props {
        tab: EditorTab;
        isActive: boolean;
        onclick?: (id: string) => void;
        onclose?: (e: MouseEvent, tabId: string) => void;
        oncontextmenu?: (e: MouseEvent, tabId: string) => void;
    }

    let { tab, isActive, onclick, onclose, oncontextmenu }: Props = $props();

    let isFileMissing = $derived(tab.fileCheckFailed === true);
    let isCollapsed = $derived(appContext.app.collapsePinnedTabs && tab.isPinned);

    let tooltipContent = $derived.by(() => {
        const parts: string[] = [];
        const sizeStr = formatFileSize(tab.sizeBytes || 0);
        const formattedTime = tab.formattedTimestamp || '';

        const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

        if (tab.fileCheckFailed) {
            parts.push('File missing from original location');
            if (tab.path) parts.push(tab.path);
        } else {
            parts.push(tab.path || 'Unsaved content');
        }
        parts.push(bottomLine);

        if (isCollapsed) {
            return `${tab.customTitle || tab.title}\n${parts.join('\n')}`;
        }

        return parts.join('\n');
    });
</script>

<div
    role="button"
    tabindex="0"
    data-active={isActive}
    data-tab-id={tab.id}
    class="group text-ui-sm relative flex h-8 shrink-0 cursor-default items-center gap-2 text-left transition-colors duration-150 outline-none select-none"
    class:bg-bg-main={isActive}
    class:bg-bg-panel={!isActive}
    class:hover:bg-bg-hover={!isActive}
    class:text-fg-default={isActive}
    class:text-fg-muted={!isActive}
    class:border-r={!isActive}
    class:justify-center={isCollapsed}
    class:px-2={!isCollapsed}
    style="
        min-width: {isCollapsed ? '36px' : `${appContext.app.tabWidthMin}px`};
        max-width: {isCollapsed ? '36px' : `${appContext.app.tabWidthMax}px`};
        width: {isCollapsed ? '36px' : 'auto'};
        {isActive
        ? 'border-top: 2px solid var(--accent-primary); border-top-left-radius: 0.375rem; border-top-right-radius: 0.375rem; border-bottom: 2px solid var(--color-bg-main);'
        : ''}
    "
    onclick={() => onclick?.(tab.id)}
    oncontextmenu={(e) => {
        e.preventDefault();
        oncontextmenu?.(e, tab.id);
    }}
    onkeydown={(e) => e.key === 'Enter' && onclick?.(tab.id)}
    use:tooltip={isCollapsed ? tooltipContent : null}>
    {#if isFileMissing}
        <CircleAlert size={14} class="text-danger-text shrink-0" />
    {:else if !tab.path}
        {#if tab.content.length > 0}
            <PencilLine
                size={14}
                class="shrink-0 {isActive && tab.isDirty
                    ? 'text-dirty-active'
                    : isActive
                      ? 'text-fg-inverse'
                      : 'text-fg-muted'}" />
        {:else}
            <Pencil size={14} class="shrink-0 {isActive ? 'text-fg-inverse' : 'text-fg-muted'}" />
        {/if}
    {:else if tab.isDirty}
        <SquarePen
            size={14}
            class="shrink-0 {isActive && tab.isDirty
                ? 'text-dirty-active'
                : isActive
                  ? 'text-fg-inverse'
                  : 'text-accent-secondary'}" />
    {:else}
        <FileText size={14} class="shrink-0 {isActive ? 'text-fg-inverse' : 'text-fg-muted'}" />
    {/if}

    {#if !isCollapsed}
        <div class="flex-1 truncate" use:tooltip={tooltipContent}>
            <span class="pointer-events-none truncate">{tab.customTitle || tab.title}</span>
        </div>

        <div class="absolute top-0 right-0 bottom-0 flex w-8 items-center justify-center">
            {#if tab.isPinned}
                <div
                    class={'absolute inset-0 flex items-center justify-center ' +
                        (isActive ? 'bg-bg-main' : 'bg-bg-panel group-hover:bg-bg-hover')}>
                    <Pin
                        size={12}
                        class="shrink-0 {isActive ? 'text-accent-secondary' : 'text-fg-muted'}" />
                </div>
            {:else}
                <div
                    class="close-btn-wrapper absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                    style="background: linear-gradient(to right, transparent 0%, {isActive
                        ? 'var(--surface-1)'
                        : 'var(--surface-2)'} 40%, {isActive
                        ? 'var(--surface-1)'
                        : 'var(--surface-2)'} 100%);">
                    <span
                        role="button"
                        tabindex="0"
                        class="text-fg-muted hover:text-danger-text hover-surface flex cursor-pointer items-center justify-center rounded p-1"
                        onclick={(e) => {
                            e.stopPropagation();
                            if (onclose) onclose(e as unknown as MouseEvent, tab.id);
                        }}
                        onkeydown={(e) =>
                            e.key === 'Enter' && onclose?.(e as unknown as MouseEvent, tab.id)}
                        use:tooltip={`Close ${tab.title}`}>
                        <X size={14} class="transition-colors" />
                    </span>
                </div>
            {/if}
        </div>
    {/if}
</div>
