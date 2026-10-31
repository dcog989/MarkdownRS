import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";

export function clampSplit(ratio: number): number {
  return Math.max(CONFIG.SPLIT.MIN_PERCENTAGE, Math.min(CONFIG.SPLIT.MAX_PERCENTAGE, ratio));
}

interface SplitResizeOptions {
  getValue?: () => number;
  setValue?: (ratio: number) => void;
  getIsVertical?: () => boolean;
}

export function createSplitResize({
  getValue = () => appContext.settings.splitPercentage,
  setValue = (ratio) => {
    appContext.settings.splitPercentage = ratio;
  },
  getIsVertical = () => appContext.settings.splitOrientation === "vertical",
}: SplitResizeOptions = {}) {
  let isDragging = $state(false);
  let dragStart = 0;
  let initialSplit = 0;

  let isVertical = $derived(getIsVertical());
  let resizeCursor = $derived(isVertical ? "col-resize" : "row-resize");
  let clientAxis = $derived.by(() => (isVertical ? "clientX" : "clientY") as "clientX" | "clientY");
  let sizeAxis = $derived.by(() => (isVertical ? "width" : "height") as "width" | "height");

  let containerEl = $state<HTMLElement | null>(null);

  let _boundHandleResize: ((e: PointerEvent) => void) | null = null;
  let _boundStopResize: (() => void) | null = null;

  function registerContainer(el: HTMLElement) {
    containerEl = el;
  }

  function startResize(e: PointerEvent) {
    e.preventDefault();
    isDragging = true;
    dragStart = e[clientAxis];
    initialSplit = getValue();

    // Capture the pointer so releasing outside the window still ends the drag.
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);

    _boundHandleResize = (ev: PointerEvent) => handleResize(ev);
    _boundStopResize = () => stopResize();

    window.addEventListener("pointermove", _boundHandleResize);
    window.addEventListener("pointerup", _boundStopResize);
    document.body.style.cursor = resizeCursor;
  }

  function handleResize(e: PointerEvent) {
    if (!isDragging || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const totalSize = rect[sizeAxis];
    const currentPos = e[clientAxis];
    const deltaPixels = currentPos - dragStart;
    const deltaPercent = deltaPixels / totalSize;
    setValue(clampSplit(initialSplit + deltaPercent));
  }

  function stopResize() {
    if (!isDragging) return;
    isDragging = false;
    if (_boundHandleResize) window.removeEventListener("pointermove", _boundHandleResize);
    if (_boundStopResize) window.removeEventListener("pointerup", _boundStopResize);
    _boundHandleResize = null;
    _boundStopResize = null;
    document.body.style.cursor = "default";
  }

  function resetSplit() {
    setValue(CONFIG.SPLIT.DEFAULT_PERCENTAGE);
  }

  function keyboardDelta(key: string): number {
    if (isVertical) {
      if (key === "ArrowLeft") return -CONFIG.SPLIT.KEYBOARD_STEP;
      if (key === "ArrowRight") return CONFIG.SPLIT.KEYBOARD_STEP;
    } else {
      if (key === "ArrowUp") return -CONFIG.SPLIT.KEYBOARD_STEP;
      if (key === "ArrowDown") return CONFIG.SPLIT.KEYBOARD_STEP;
    }
    return 0;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Home") {
      e.preventDefault();
      resetSplit();
      return;
    }

    const delta = keyboardDelta(e.key);
    if (delta === 0) return;
    e.preventDefault();
    setValue(clampSplit(getValue() + delta));
  }

  function cleanup() {
    isDragging = false;
    if (_boundHandleResize) window.removeEventListener("pointermove", _boundHandleResize);
    if (_boundStopResize) window.removeEventListener("pointerup", _boundStopResize);
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
    registerContainer,
    startResize,
    resetSplit,
    handleKeyDown,
    cleanup,
  };
}
