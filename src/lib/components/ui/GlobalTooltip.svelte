<script lang="ts">
    import { appContext } from '$lib/stores/state.svelte.ts';
    import TooltipContainer from './TooltipContainer.svelte';
</script>

<TooltipContainer
    x={appContext.ui.tooltip.x}
    y={appContext.ui.tooltip.y}
    isVisible={appContext.ui.tooltip.visible && !!appContext.ui.tooltip.content}>
    {appContext.ui.tooltip.content}
</TooltipContainer>
