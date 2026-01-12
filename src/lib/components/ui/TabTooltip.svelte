<script lang="ts">
    import type { EditorTab } from '$lib/stores/editorStore.svelte.ts';
    import { formatFileSize } from '$lib/utils/fileValidation';
    import TooltipContainer from './TooltipContainer.svelte';

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
            parts.push('Unsaved content');
        }

        const sizeStr = formatFileSize(tab.sizeBytes || 0);
        const formattedTime = tab.formattedTimestamp || '';

        if (formattedTime) {
            parts.push(`${formattedTime}, ${sizeStr}`);
        } else {
            parts.push(sizeStr);
        }

        return parts.join('\n');
    });
</script>

<TooltipContainer {x} {y} {isVisible} className="break-all">
    {tooltipContent}
</TooltipContainer>
