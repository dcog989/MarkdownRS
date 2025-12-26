<script lang="ts">
    import type { EditorTab } from "$lib/stores/editorStore.svelte.ts";
    import { formatFileSize } from "$lib/utils/fileValidation";
    import TooltipContainer from "./TooltipContainer.svelte";

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

<TooltipContainer {x} {y} {isVisible} className="break-all">
    {tooltipContent}
</TooltipContainer>
