import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";

export function createSplitResize() {
  let isDragging = $state(false);
  let dragStart = 0;
  let initialSplit = 0;

  let isVertical = $derived(appContext.settings.splitOrientation === "vertical");
  let resizeCursor = $derived(isVertical ? "col-resize" : "row-resize");
  let clientAxis = $derived.by(() => (isVertical ? "clientX" : "clientY") as "clientX" | "clientY");
  let sizeAxis = $derived.by(() => (isVertical ? "width" : "height") as "width" | "height");

  let containerEl = $state<HTMLElement | null>(null);

  let _boundHandleResize: ((e: MouseEvent) => void) | null = null;
  let _boundStopResize: (() => void) | null = null;

  function registerContainer(el: HTMLElement) {
    containerEl = el;
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    dragStart = e[clientAxis];
    initialSplit = appContext.settings.splitPercentage;

    _boundHandleResize = (ev: MouseEvent) => handleResize(ev);
    _boundStopResize = () => stopResize();

    window.addEventListener("mousemove", _boundHandleResize);
    window.addEventListener("mouseup", _boundStopResize);
    document.body.style.cursor = resizeCursor;
  }

  function handleResize(e: MouseEvent) {
    if (!isDragging || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const totalSize = rect[sizeAxis];
    const currentPos = e[clientAxis];
    const deltaPixels = currentPos - dragStart;
    const deltaPercent = deltaPixels / totalSize;
    let newSplit = initialSplit + deltaPercent;

    newSplit = Math.max(CONFIG.SPLIT.MIN_PERCENTAGE, Math.min(CONFIG.SPLIT.MAX_PERCENTAGE, newSplit));
    appContext.settings.splitPercentage = newSplit;
  }

  function stopResize() {
    if (!isDragging) return;
    isDragging = false;
    if (_boundHandleResize) window.removeEventListener("mousemove", _boundHandleResize);
    if (_boundStopResize) window.removeEventListener("mouseup", _boundStopResize);
    _boundHandleResize = null;
    _boundStopResize = null;
    document.body.style.cursor = "default";
  }

  function resetSplit() {
    appContext.settings.splitPercentage = 0.5;
  }

  function cleanup() {
    isDragging = false;
    if (_boundHandleResize) window.removeEventListener("mousemove", _boundHandleResize);
    if (_boundStopResize) window.removeEventListener("mouseup", _boundStopResize);
    _boundHandleResize = null;
    _boundStopResize = null;
    document.body.style.cursor = "default";
  }

  return {
    get isVertical() {
      return isVertical;
    },
    get resizeCursor() {
      return resizeCursor;
    },
    get isDragging() {
      return isDragging;
    },
    registerContainer,
    startResize,
    resetSplit,
    cleanup,
  };
}
