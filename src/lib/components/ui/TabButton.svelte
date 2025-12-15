<script lang="ts">
    import { tooltip } from "$lib/actions/tooltip";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";
    import { AlertCircle, File, FileText, Pencil, Pin, X } from "lucide-svelte";
    import { onMount } from "svelte";

    interface Props {
        tab: EditorTab;
        isActive: boolean;
        index: number;
        draggedTabId: string | null;
        draggedOverTabId: string | null;
        currentTime: number;

        // Callbacks
        onclick?: (id: string) => void;
        onclose?: (e: MouseEvent, tabId: string) => void;
        oncontextmenu?: (e: MouseEvent, tabId: string) => void;

        ondragstart?: (e: DragEvent, tabId: string) => void;
        ondragover?: (e: DragEvent, tabId: string) => void;
        ondragenter?: (e: DragEvent, tabId: string) => void;
        ondragleave?: (e: DragEvent, tabId: string) => void;
        ondrop?: (e: DragEvent, tabId: string) => void;
        ondragend?: (e: DragEvent) => void;
    }

    let { tab, isActive, index, draggedTabId, draggedOverTabId, currentTime, onclick, onclose, oncontextmenu, ondragstart, ondragover, ondragenter, ondragleave, ondrop, ondragend }: Props = $props();

    onMount(() => {
        // DIAGNOSTIC: Verify component is mounted
    });

    let isFileMissing = $derived(tab.fileCheckFailed === true);

    let iconColor = $derived.by(() => {
        const _ = currentTime;
        if (!tab.modified) return isActive ? "#ffffff" : "var(--fg-muted)";
        return isActive ? "#ffffff" : "var(--fg-muted)";
    });

    let opacity = $derived(draggedTabId === tab.id ? "0.4" : "1");
    let borderLeft = $derived(draggedOverTabId === tab.id ? "2px solid var(--accent-primary)" : "");
    let borderTop = $derived(isActive ? "2px solid var(--accent-secondary)" : "transparent");
    let color = $derived(isActive ? "var(--fg-default)" : "var(--fg-muted)");

    let tooltipContent = $derived.by(() => {
        const parts: string[] = [];

        // Line 1: Path or Unsaved
        if (tab.path) {
            parts.push(tab.path);
        } else {
            parts.push("Unsaved content");
        }

        // Line 2: Timestamp and Size
        const timestamp = tab.modified || tab.created || "";
        let formattedTime = "";

        if (timestamp.includes(" / ")) {
            const [datePart, timePart] = timestamp.split(" / ");
            // Format HHMMSS -> HH:MM:SS
            const formattedTimePart = timePart.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
            formattedTime = `${datePart}, ${formattedTimePart}`;
        } else {
            formattedTime = timestamp;
        }

        const text = tab.content || "";
        const sizeBytes = new TextEncoder().encode(text).length;
        const sizeStr = formatFileSize(sizeBytes);

        if (formattedTime) {
            parts.push(`${formattedTime}, ${sizeStr}`);
        } else {
            parts.push(sizeStr);
        }

        return parts.join("\n");
    });

    function onInternalDragStart(e: DragEvent) {
        if (ondragstart) ondragstart(e, tab.id);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    data-active={isActive}
    data-tab-index={index}
    data-tab-id={tab.id}
    draggable={!tab.isPinned}
    use:tooltip={tooltipContent}
    class="tab-button group relative h-8 pl-2 pr-0 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden transition-colors duration-150"
    style="
        --tab-bg: {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'};
        color: {color};
        border-color: var(--border-main);
        border-top: {borderTop};
        border-radius: 4px 4px 0 0;
        min-width: 100px;
        max-width: 200px;
        opacity: {opacity};
        border-left: {borderLeft};
    "
    role="button"
    tabindex="0"
    onclick={() => onclick?.(tab.id)}
    oncontextmenu={(e) => oncontextmenu?.(e, tab.id)}
    ondragstart={onInternalDragStart}
    ondragover={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ondragover?.(e, tab.id);
    }}
    ondragenter={(e) => {
        e.preventDefault();
        ondragenter?.(e, tab.id);
    }}
    ondragleave={(e) => ondragleave?.(e, tab.id)}
    ondrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ondrop?.(e, tab.id);
    }}
    {ondragend}
    onkeydown={(e) => e.key === "Enter" && onclick?.(tab.id)}
>
    <!-- File Type Icon -->
    {#if isFileMissing}
        <AlertCircle size={14} class="flex-shrink-0" style="color: var(--danger-text);" />
    {:else if tab.path && tab.isDirty}
        <Pencil size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {:else if tab.path}
        <FileText size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {:else}
        <File size={14} class="flex-shrink-0" style="color: {iconColor}" />
    {/if}

    <!-- Title (Full Width) -->
    <span class="truncate flex-1 w-full text-left">{tab.customTitle || tab.title}</span>

    <!-- Pin Icon (Static) -->
    {#if tab.isPinned}
        <div class="w-6 flex items-center justify-center">
            <Pin size={12} class="flex-shrink-0" style="color: {isActive ? 'var(--accent-secondary)' : 'var(--fg-muted)'}" />
        </div>
    {/if}

    <!-- Close Button (Overlay on Right) -->
    {#if !tab.isPinned}
        <div class="close-btn-wrapper absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <span
                role="button"
                tabindex="0"
                class="p-0.5 rounded hover:bg-white/20 flex items-center justify-center"
                style="color: var(--fg-muted);"
                onclick={(e) => {
                    e.stopPropagation();
                    if (onclose) onclose(e as unknown as MouseEvent, tab.id);
                }}
                onkeydown={(e) => e.key === "Enter" && onclose?.(e as unknown as MouseEvent, tab.id)}
                use:tooltip={`Close ${tab.title}`}
            >
                <X size={12} class="hover:text-[var(--danger-text)]" />
            </span>
        </div>
    {/if}
</div>

<style>
    .tab-button {
        -webkit-app-region: no-drag;
        -webkit-user-drag: element;
        user-select: none;
        background-color: var(--tab-bg);
    }

    .tab-button:not([data-active="true"]):hover {
        --tab-bg: var(--bg-hover) !important;
    }

    .close-btn-wrapper {
        background: linear-gradient(to right, transparent 0%, var(--tab-bg) 30%);
    }

    .tab-button[draggable="true"] {
        cursor: default;
    }

    .tab-button > * {
        pointer-events: none;
    }

    .tab-button > .close-btn-wrapper {
        pointer-events: auto;
    }
</style>
