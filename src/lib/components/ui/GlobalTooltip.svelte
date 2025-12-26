<script lang="ts">
    import { tooltipStore } from "$lib/stores/tooltipStore.svelte.ts";
    import TooltipContainer from "./TooltipContainer.svelte";
</script>

<TooltipContainer x={tooltipStore.x} y={tooltipStore.y} isVisible={tooltipStore.visible && !!tooltipStore.content}>
    {tooltipStore.content}
</TooltipContainer>
