<script lang="ts">
    import { appState } from "$lib/stores/appState.svelte.ts";
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { AlertCircle, File, FileText, Pencil, Pin, X } from "lucide-svelte";
    import { onMount } from "svelte";
    import TabTooltip from "./TabTooltip.svelte";

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

    // Tooltip state
    let showTooltip = $state(false);
    let tooltipTimer: number | null = null;
    let mouseX = $state(0);
    let mouseY = $state(0);

    function handleMouseEnter(e: MouseEvent) {
        if (!tab.path) return; // Only show tooltip for saved files
        
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (tooltipTimer) clearTimeout(tooltipTimer);
        tooltipTimer = window.setTimeout(() => {
            showTooltip = true;
        }, appState.tooltipDelay);
    }

    function handleMouseLeave() {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        showTooltip = false;
    }

    onMount(() => {
        // DIAGNOSTIC: Verify component is mounted and draggable state
        console.log(`[TabButton:${tab.id}] Mounted. Pinned: ${tab.isPinned}, Draggable: ${!tab.isPinned}`);
    });

    let isFileMissing = $derived(tab.fileCheckFailed === true);

    let iconColor = $derived.by(() => {
        const _ = currentTime;
        if (!tab.modified) return isActive ? "#ffffff" : "var(--fg-muted)";
        return isActive ? "#ffffff" : "var(--fg-muted)"; // Changed from green to muted
    });

    let opacity = $derived(draggedTabId === tab.id ? "0.4" : "1");
    let borderLeft = $derived(draggedOverTabId === tab.id ? "2px solid var(--accent-primary)" : "");
    let bg = $derived(isActive ? "var(--bg-main)" : "var(--bg-panel)");
    let hoverBg = $derived(isActive ? "var(--bg-main)" : "var(--bg-hover)");
    let color = $derived(isActive ? "var(--fg-default)" : "var(--fg-muted)");
    let borderTop = $derived(isActive ? "2px solid var(--accent-secondary)" : "transparent");

    function onInternalDragStart(e: DragEvent) {
        console.error(`[TabButton:${tab.id}] NATIVE DRAG START FIRED`);
        if (ondragstart) ondragstart(e, tab.id);
    }

    function onInternalMouseDown(e: MouseEvent) {
        // DIAGNOSTIC: Ensure mouse down is received
        // console.log(`[TabButton:${tab.id}] MouseDown`);
        // Hide tooltip on click
        handleMouseLeave();
    }
</script>

<TabTooltip {tab} isVisible={showTooltip} x={mouseX} y={mouseY} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    data-active={isActive}
    data-tab-index={index}
    data-tab-id={tab.id}
    draggable={!tab.isPinned}
    class="tab-button group relative h-8 pl-2 pr-0 flex items-center gap-2 text-xs cursor-pointer border-r outline-none text-left shrink-0 overflow-hidden transition-colors duration-150"
    style="
        background-color: {bg};
        color: {color};
        border-color: var(--border-main);
        border-top: {borderTop};
        border-radius: 4px 4px 0 0;
        min-width: 100px;
        max-width: 200px;
        opacity: {opacity};
        border-left: {borderLeft};
        --hover-bg: {hoverBg};
    "
    role="button"
    tabindex="0"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    onmousedown={onInternalMouseDown}
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
        console.error(`[TabButton:${tab.id}] NATIVE DROP FIRED`);
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
        <div class="close-btn-wrapper absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" style="background: linear-gradient(to right, transparent 0%, {isActive ? 'var(--bg-main)' : 'var(--bg-panel)'} 30%);">
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
                aria-label={`Close ${tab.title}`}
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
    }

    .tab-button[draggable="true"] {
        cursor: default; /* Reset cursor to default to avoid "grab" on hover unless actively grabbing */
    }

    /* Disable pointer events on all children to ensure the drop target is correct */
    .tab-button > * {
        pointer-events: none;
    }

    /* Re-enable pointer events for the close button wrapper so it can be clicked */
    .tab-button > .close-btn-wrapper {
        pointer-events: auto;
    }

    /* Hover effect for inactive tabs */
    .tab-button:not([data-active="true"]):hover {
        background-color: var(--hover-bg) !important;
    }
</style>
