import { appContext } from '$lib/stores/state.svelte';
import { getCursorPosition, hideTooltip, showTooltip } from '$lib/stores/tooltipStore.svelte';

export function tooltip(node: HTMLElement, content: string | undefined | null) {
  let timer: number | null = null;

  function handleMouseEnter(e: MouseEvent) {
    if (!content) return;

    const delay = appContext.settings.tooltipDelay;
    timer = window.setTimeout(() => {
      // Anchor to the cursor's current position: on window re-entry the
      // synthetic mouseenter carries the entry point, which is stale by the
      // time the delay elapses.
      const { x, y } = getCursorPosition();
      showTooltip(content as string, x ?? e.clientX, y ?? e.clientY);
    }, delay);
  }

  function handleMouseLeave() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hideTooltip();
  }

  function handleMouseDown() {
    handleMouseLeave();
  }

  node.addEventListener('mouseenter', handleMouseEnter);
  node.addEventListener('mouseleave', handleMouseLeave);
  node.addEventListener('mousedown', handleMouseDown);

  return {
    update(newContent: string | undefined | null) {
      handleMouseLeave();
      content = newContent;
      if (appContext.ui.tooltip.visible && content) {
        appContext.ui.tooltip.content = content;
      }
    },
    destroy() {
      handleMouseLeave();
      node.removeEventListener('mouseenter', handleMouseEnter);
      node.removeEventListener('mouseleave', handleMouseLeave);
      node.removeEventListener('mousedown', handleMouseDown);
    },
  };
}
