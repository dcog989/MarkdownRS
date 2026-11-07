import { appContext } from "$lib/stores/state.svelte";
import { hideTooltip, showTooltip } from "$lib/stores/tooltipStore.svelte";

export type TooltipContent = string | undefined | null;
export type TooltipParam = TooltipContent | { content: TooltipContent; instant?: boolean };

// The single node whose content owns the currently visible tooltip. `update`
// only rewrites the shared tooltip content for this node, so a re-render of
// other tooltipped elements (e.g. settings rows with inline object params that
// change identity every render) can't clobber what is on screen.
let activeNode: HTMLElement | null = null;

// Pending show timers across every tooltipped node. The window-exit signal
// clears them directly: WebKitGTK can skip the hovered element's mouseleave
// when the pointer leaves the window, so its timer would otherwise fire after
// the pointer is gone and show the tooltip.
const pendingTimers = new Set<number>();

export function cancelPendingTooltips() {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
}

export function tooltip(node: HTMLElement, param: TooltipParam) {
  let timer: number | null = null;
  let content: TooltipContent = null;
  let instant = false;

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    pendingTimers.delete(timer);
    timer = null;
  }

  function applyParam(p: TooltipParam) {
    if (p && typeof p === "object") {
      content = p.content;
      instant = p.instant ?? false;
    } else {
      content = p;
      instant = false;
    }
  }

  applyParam(param);

  function handleMouseEnter(e: MouseEvent) {
    // Hovering an inactive window must not pop a tooltip. KDE windows keep
    // receiving pointer events while another window has focus.
    if (!content || !document.hasFocus()) return;

    // Clear any pending show before re-arming: a second mouseenter can arrive
    // before the first timer fires, orphaning it.
    clearTimer();

    // Instant tooltips (e.g. memory warnings) ignore the configured delay.
    if (instant) {
      activeNode = node;
      showTooltip(content as string, e.clientX, e.clientY);
      return;
    }

    const delay = appContext.settings.tooltipDelay;
    const x = e.clientX;
    const y = e.clientY;
    const id = window.setTimeout(() => {
      pendingTimers.delete(id);
      timer = null;
      // Focus can move during the delay; don't show into an inactive window.
      if (!document.hasFocus()) return;
      activeNode = node;
      showTooltip(content as string, x, y);
    }, delay);
    timer = id;
    pendingTimers.add(id);
  }

  function handleMouseLeave() {
    clearTimer();
    if (activeNode === node) {
      activeNode = null;
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
    update(newParam: TooltipParam) {
      clearTimer();
      applyParam(newParam);
      if (!content) {
        hideTooltip();
        return;
      }
      if (appContext.ui.tooltip.visible && activeNode === node) {
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
