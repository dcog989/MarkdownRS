<script lang="ts">
import TooltipContainer from "$lib/components/ui/TooltipContainer.svelte";
import { appContext } from "$lib/stores/state.svelte";
</script>

<TooltipContainer
  x={appContext.ui.tooltip.x}
  y={appContext.ui.tooltip.y}
  isVisible={appContext.ui.tooltip.visible && !!appContext.ui.tooltip.content}
>
  {appContext.ui.tooltip.content}
</TooltipContainer>
