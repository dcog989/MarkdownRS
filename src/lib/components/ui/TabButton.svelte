<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import { appState } from "$lib/stores/appState.svelte.ts";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";
    import { CircleAlert, FileText, Pencil, PencilLine, Pin, X } from "lucide-svelte";

    interface Props {
        tab: EditorTab;
        isActive: boolean;
        currentTime: number;
        onclick?: (id: string) => void;
        onclose?: (e: MouseEvent, tabId: string) => void;
        oncontextmenu?: (e: MouseEvent, tabId: string) => void;
    }

    let { tab, isActive, currentTime, onclick, onclose, oncontextmenu }: Props = $props();

    let isFileMissing = $derived(tab.fileCheckFailed === true);

    let iconColor = $derived.by(() => {
        const _ = currentTime;
        return isActive ? "#ffffff" : "var(--color-fg-muted)";
    });

    let borderTop = $derived(isActive ? "2px solid var(--color-accent-secondary)" : "transparent");
    let color = $derived(isActive ? "var(--color-fg-default)" : "var(--color-fg-muted)");

    let tooltipContent = $derived.by(() => {
        const parts: string[] = [];
        const sizeStr = formatFileSize(tab.sizeBytes || 0);
        const timestamp = tab.modified || tab.created || "";
        let formattedTime = timestamp;

        if (timestamp.includes(" / ")) {
            const [datePart, timePart] = timestamp.split(" / ");
            formattedTime = `${datePart}, ${timePart.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3")}`;
        }

        const bottomLine = formattedTime ? `${formattedTime}, ${sizeStr}` : sizeStr;

        if (tab.fileCheckFailed) {
            parts.push("File missing from original location");
            if (tab.path) parts.push(tab.path);
        } else {
            parts.push(tab.path || "Unsaved content");
        }
        parts.push(bottomLine);
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
    use:tooltip={tooltipContent}
    class="tab-button group relative h-8 px-2 flex items-center gap-2 text-ui-sm cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden transition-colors duration-150"
    style="
        --tab-bg: {isActive ? 'var(--color-bg-main)' : 'var(--color-bg-panel)'};
        color: {color};
        border-color: var(--color-border-main);
        border-top: {borderTop};
        border-radius: 4px 4px 0 0;
        min-width: {appState.tabWidthMin}px;
        max-width: {appState.tabWidthMax}px;
        cursor: default;
        user-select: none;
    "
    onclick={() => onclick?.(tab.id)}
    oncontextmenu={(e) => {
        e.preventDefault();
        oncontextmenu?.(e, tab.id);
    }}
    onkeydown={(e) => e.key === "Enter" && onclick?.(tab.id)}
>
    {#if isFileMissing}
        <CircleAlert size={14} class="flex-shrink-0" style="color: var(--color-danger-text);" />
    {:else if !tab.path && tab.isDirty}
        <PencilLine size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {:else if !tab.path}
        <Pencil size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {:else if tab.isDirty}
        <PencilLine size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {:else}
        <FileText size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {/if}

    <span class="truncate flex-1 pointer-events-none pr-8">{tab.customTitle || tab.title}</span>

    <div class="absolute right-2 top-0 bottom-0 w-8 flex items-center justify-center">
        {#if tab.isPinned}
            <Pin size={12} class="flex-shrink-0" style="color: {isActive ? 'var(--color-accent-secondary)' : 'var(--color-fg-muted)'}" />
        {:else}
            <div class="close-btn-wrapper absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <span
                    role="button"
                    tabindex="0"
                    class="p-0.5 rounded hover:bg-white/20 flex items-center justify-center cursor-pointer"
                    style="color: var(--color-fg-muted);"
                    onclick={(e) => {
                        e.stopPropagation();
                        if (onclose) onclose(e as unknown as MouseEvent, tab.id);
                    }}
                    onkeydown={(e) => e.key === "Enter" && onclose?.(e as unknown as MouseEvent, tab.id)}
                    use:tooltip={`Close ${tab.title}`}
                >
                    <X size={14} class="hover:text-[var(--color-danger-text)]" />
                </span>
            </div>
        {/if}
    </div>
</div>

<style>
    .tab-button {
        background-color: var(--tab-bg);
    }

    .tab-button:not([data-active="true"]):hover {
        --tab-bg: var(--color-bg-hover) !important;
    }

    .close-btn-wrapper {
        background: linear-gradient(to right, transparent 0%, var(--tab-bg) 50%);
        pointer-events: auto;
    }
</style>
