import { appContext } from '$lib/stores/state.svelte.ts';

export function createSplitResize() {
  let isDragging = $state(false);
  let dragStart = 0;
  let initialSplit = 0;

  let isVertical = $derived(appContext.app.splitOrientation === 'vertical');
  let resizeCursor = $derived(isVertical ? 'col-resize' : 'row-resize');
  let clientAxis = $derived.by(() => (isVertical ? 'clientX' : 'clientY') as 'clientX' | 'clientY');
  let sizeAxis = $derived.by(() => (isVertical ? 'width' : 'height') as 'width' | 'height');

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
    initialSplit = appContext.app.splitPercentage;

    _boundHandleResize = (ev: MouseEvent) => handleResize(ev);
    _boundStopResize = () => stopResize();

    window.addEventListener('mousemove', _boundHandleResize);
    window.addEventListener('mouseup', _boundStopResize);
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

    newSplit = Math.max(0.1, Math.min(0.9, newSplit));
    appContext.app.splitPercentage = newSplit;
  }

  function stopResize() {
    if (!isDragging) return;
    isDragging = false;
    if (_boundHandleResize) window.removeEventListener('mousemove', _boundHandleResize);
    if (_boundStopResize) window.removeEventListener('mouseup', _boundStopResize);
    _boundHandleResize = null;
    _boundStopResize = null;
    document.body.style.cursor = 'default';
  }

  function resetSplit() {
    appContext.app.splitPercentage = 0.5;
  }

  function cleanup() {
    if (_boundHandleResize) window.removeEventListener('mousemove', _boundHandleResize);
    if (_boundStopResize) window.removeEventListener('mouseup', _boundStopResize);
    _boundHandleResize = null;
    _boundStopResize = null;
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
