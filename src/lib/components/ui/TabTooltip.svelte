<script lang="ts">
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";

    let {
        tab,
        isVisible = false,
        x = 0,
        y = 0,
    } = $props<{
        tab: EditorTab;
        isVisible: boolean;
        x: number;
        y: number;
    }>();

    let tooltipEl = $state<HTMLDivElement>();
    let adjustedX = $state(0);
    let adjustedY = $state(0);

    // Calculate position with constraints
    $effect(() => {
        if (isVisible && tooltipEl) {
            const rect = tooltipEl.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;

            let newX = x;
            let newY = y + 20;

            // Constrain X (Keep within screen width)
            if (newX + rect.width > winW) {
                newX = winW - rect.width - 10;
            }
            if (newX < 10) {
                newX = 10;
            }

            // Constrain Y (Keep within screen height)
            if (newY + rect.height > winH) {
                newY = y - rect.height - 5;
            }

            adjustedX = newX;
            adjustedY = newY;
        }
    });

    let tooltipContent = $derived.by(() => {
        const parts: string[] = [];

        if (tab.path) {
            parts.push(tab.path);
        } else {
            parts.push("Unsaved content");
        }

        const timestamp = tab.modified || tab.created || "";
        let formattedTime = "";

        if (timestamp.includes(" / ")) {
            const [datePart, timePart] = timestamp.split(" / ");
            const formattedTimePart = timePart.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
            formattedTime = `${datePart}, ${formattedTimePart}`;
        } else {
            formattedTime = timestamp;
        }

        const sizeStr = formatFileSize(tab.sizeBytes || 0);

        if (formattedTime) {
            parts.push(`${formattedTime}, ${sizeStr}`);
        } else {
            parts.push(sizeStr);
        }

        return parts.join("\n");
    });
</script>

{#if isVisible}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={tooltipEl} class="fixed z-[9999] pointer-events-none" style="left: {adjustedX}px; top: {adjustedY}px;">
        <div
            class="p-2 rounded shadow-2xl border text-ui-sm whitespace-pre-line max-w-lg break-all leading-relaxed"
            style="
                background-color: var(--color-bg-header);
                border-color: var(--color-border-light);
                color: var(--color-fg-default);
            "
        >
            {tooltipContent}
        </div>
    </div>
{/if}
