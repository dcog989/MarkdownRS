import { appContext } from "$lib/stores/state.svelte";
import { getCursorPosition, hideTooltip, showTooltip } from "$lib/stores/tooltipStore.svelte";

export function tooltip(node: HTMLElement, content: string | undefined | null) {
  let timer: number | null = null;

  function handleMouseEnter(e: MouseEvent) {
    if (!content) return;

    // Clear any pending show before re-arming: window re-entry fires a
    // synthetic mouseenter and a real one can arrive shortly after, orphaning
    // the first timer. The orphaned timer would show the tooltip after the
    // cursor has already left, leaving it stuck open.
    if (timer) {
      clearTimeout(timer);
    }

    const delay = appContext.settings.tooltipDelay;
    timer = window.setTimeout(() => {
      timer = null;
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

  node.addEventListener("mouseenter", handleMouseEnter);
  node.addEventListener("mouseleave", handleMouseLeave);
  node.addEventListener("mousedown", handleMouseDown);

  return {
    update(newContent: string | undefined | null) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      content = newContent;
      if (!content) {
        hideTooltip();
        return;
      }
      if (appContext.ui.tooltip.visible) {
        appContext.ui.tooltip.content = content;
      }
    },
    destroy() {
      handleMouseLeave();
      node.removeEventListener("mouseenter", handleMouseEnter);
      node.removeEventListener("mouseleave", handleMouseLeave);
      node.removeEventListener("mousedown", handleMouseDown);
    },
  };
}
