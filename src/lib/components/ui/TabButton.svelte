<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { appContext } from "$lib/stores/state.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";
    import { CircleAlert, FileText, Pencil, PencilLine, Pin, SquarePen, X } from "lucide-svelte";

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
        const formattedTime = tab.formattedTimestamp || "";

        const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

        if (tab.fileCheckFailed) {
            parts.push("File missing from original location");
            if (tab.path) parts.push(tab.path);
        } else {
            parts.push(tab.path || "Unsaved content");
        }
        parts.push(bottomLine);

        if (isCollapsed) {
            return `${tab.customTitle || tab.title}\n${parts.join("\n")}`;
        }

        return parts.join("\n");
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    role="button"
    tabindex="0"
    data-active={isActive}
    data-tab-id={tab.id}
    class="group relative h-8 flex items-center gap-2 text-ui-sm cursor-default border-r border-t-2 outline-none text-left shrink-0 overflow-hidden transition-colors duration-150 select-none border-border-main rounded-t-[4px]"
    class:bg-bg-main={isActive}
    class:bg-bg-panel={!isActive}
    class:hover:bg-bg-hover={!isActive}
    class:text-fg-default={isActive}
    class:text-fg-muted={!isActive}
    class:border-t-accent-secondary={isActive}
    class:border-t-transparent={!isActive}
    class:justify-center={isCollapsed}
    class:px-2={!isCollapsed}
    style="
        min-width: {isCollapsed ? '36px' : `${appContext.app.tabWidthMin}px`};
        max-width: {isCollapsed ? '36px' : `${appContext.app.tabWidthMax}px`};
        width: {isCollapsed ? '36px' : 'auto'};
    "
    onclick={() => onclick?.(tab.id)}
    oncontextmenu={(e) => {
        e.preventDefault();
        oncontextmenu?.(e, tab.id);
    }}
    onkeydown={(e) => e.key === "Enter" && onclick?.(tab.id)}
    use:tooltip={isCollapsed ? tooltipContent : null}
>
    {#if isFileMissing}
        <CircleAlert size={14} class="flex-shrink-0 text-danger-text" />
    {:else if !tab.path}
        {#if tab.content.length > 0}
            <PencilLine
                size={14}
                class="flex-shrink-0"
                style="color: {isActive && tab.isDirty
                    ? '#5deb47'
                    : isActive
                      ? 'var(--color-fg-inverse)'
                      : 'var(--color-fg-muted)'}"
            />
        {:else}
            <Pencil
                size={14}
                class="flex-shrink-0 {isActive ? 'text-fg-inverse' : 'text-fg-muted'}"
            />
        {/if}
    {:else if tab.isDirty}
        <SquarePen
            size={14}
            class="flex-shrink-0"
            style="color: {isActive && tab.isDirty
                ? '#5deb47'
                : isActive
                  ? 'var(--color-fg-inverse)'
                  : 'var(--color-accent-secondary)'}"
        />
    {:else}
        <FileText
            size={14}
            class="flex-shrink-0 {isActive ? 'text-fg-inverse' : 'text-fg-muted'}"
        />
    {/if}

    {#if !isCollapsed}
        <div class="truncate flex-1" use:tooltip={tooltipContent}>
            <span class="truncate pointer-events-none">{tab.customTitle || tab.title}</span>
        </div>

        <div class="absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center">
            {#if tab.isPinned}
                <div
                    class={"absolute inset-0 flex items-center justify-center " +
                        (isActive ? "bg-bg-main" : "bg-bg-panel group-hover:bg-bg-hover")}
                >
                    <Pin
                        size={12}
                        class="flex-shrink-0 {isActive ? 'text-accent-secondary' : 'text-fg-muted'}"
                    />
                </div>
            {:else}
                <div
                    class="close-btn-wrapper absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-gradient-to-r from-transparent via-40%"
                    class:via-bg-main={isActive}
                    class:to-bg-main={isActive}
                    class:via-bg-panel={!isActive}
                    class:to-bg-panel={!isActive}
                    class:group-hover:via-bg-hover={!isActive}
                    class:group-hover:to-bg-hover={!isActive}
                >
                    <span
                        role="button"
                        tabindex="0"
                        class="p-1 rounded hover:bg-white/20 flex items-center justify-center cursor-pointer text-fg-muted hover:text-danger-text"
                        onclick={(e) => {
                            e.stopPropagation();
                            if (onclose) onclose(e as unknown as MouseEvent, tab.id);
                        }}
                        onkeydown={(e) =>
                            e.key === "Enter" && onclose?.(e as unknown as MouseEvent, tab.id)}
                        use:tooltip={`Close ${tab.title}`}
                    >
                        <X size={14} class="transition-colors" />
                    </span>
                </div>
            {/if}
        </div>
    {/if}
</div>
