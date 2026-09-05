function getScrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export function scrollIntoView(node: HTMLElement, isSelected: boolean) {
  function doScroll() {
    const container = getScrollParent(node);
    if (!container) return;

    const cr = container.getBoundingClientRect();
    const nr = node.getBoundingClientRect();

    if (nr.top >= cr.top && nr.bottom <= cr.bottom) return;

    node.scrollIntoView({ block: nr.bottom > cr.bottom ? "end" : "start" });
  }

  if (isSelected) doScroll();

  return {
    update(newIsSelected: boolean) {
      if (newIsSelected) doScroll();
    },
  };
}

/**
 * Debounce function for delaying execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
