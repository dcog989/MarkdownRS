type SortableOptions<T> = {
  items: T[];
  idKey: keyof T;
  container: HTMLElement | undefined;
  itemSelector: string;
  onSort: (newItems: T[]) => void;
  onDragEnd: () => void;
  /** Distance from the container edge (px) that triggers auto-scroll. */
  edgeScrollMargin?: number;
  /** How far the container scrolls on each frame while held near an edge. */
  edgeScrollStep?: number;
};

const DEFAULT_EDGE_SCROLL_MARGIN = 48;
const DEFAULT_EDGE_SCROLL_STEP = 8;

/**
 * Pointer-based drag-to-reorder controller for a horizontal list.
 *
 * Reordering is insert-based: the dragged item is treated as lifted out of the
 * list and its target slot is derived from the pointer position relative to the
 * *other* items' live centers. Because the other items never reorder relative
 * to each other, the dragged item can only ever shift relative to them, which
 * rules out the spurious moves a stepwise "swap with neighbor" strategy causes
 * when cached positions go stale during flip animations.
 */
export class SortableController<T> {
  /** Id of the item being dragged, or null when no pointer interaction is active. */
  draggingId = $state<string | null>(null);
  /** True once the pointer has moved past the drag threshold. */
  isDragging = $state(false);
  /** Pointer x-offset within the item, kept so the ghost tracks the grab point. */
  dragOffsetX = $state(0);
  /** Latest pointer x, mirrored for the ghost to follow. */
  currentDragX = $state(0);

  private options: SortableOptions<T>;
  private startX = 0;
  private rafId: number | null = null;
  private activeWrapper: HTMLElement | null = null;

  private _handleMove = this.handleMove.bind(this);
  private _handleUp = this.handleUp.bind(this);

  constructor(options: SortableOptions<T>) {
    this.options = options;
  }

  updateOptions(newOptions: Partial<SortableOptions<T>>) {
    this.options = { ...this.options, ...newOptions };
  }

  startDrag(e: PointerEvent, id: string, wrapper: HTMLElement) {
    if (e.button !== 0) return;

    // Ignore clicks on close buttons or interactive elements
    const target = e.target;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    if (target.closest(".close-btn-wrapper") || target.closest("button")) return;

    e.preventDefault();

    this.activeWrapper = wrapper;
    wrapper.setPointerCapture(e.pointerId);

    this.draggingId = id;
    this.isDragging = false;
    this.startX = e.clientX;
    this.currentDragX = e.clientX;

    const rect = wrapper.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;

    window.addEventListener("pointermove", this._handleMove);
    window.addEventListener("pointerup", this._handleUp);
    window.addEventListener("pointercancel", this._handleUp);
  }

  handleMove(e: PointerEvent) {
    if (!this.draggingId) return;

    this.currentDragX = e.clientX;

    if (!this.isDragging) {
      if (Math.abs(e.clientX - this.startX) > 5) {
        this.isDragging = true;
      } else {
        return;
      }
    }

    if (this.rafId) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.scrollTowardEdge();
      this.sortFromPointer();
    });
  }

  handleUp(e: PointerEvent) {
    if (!this.draggingId) return;

    if (this.activeWrapper) {
      try {
        this.activeWrapper.releasePointerCapture(e.pointerId);
      } catch {
        // Capture may already be gone (e.g. the wrapper was removed mid-drag);
        // releasing is best-effort and must not block onDragEnd.
      }
      this.activeWrapper = null;
    }

    this.cleanupListeners();
    this.options.onDragEnd();
    this.reset();
  }

  private cleanupListeners() {
    window.removeEventListener("pointermove", this._handleMove);
    window.removeEventListener("pointerup", this._handleUp);
    window.removeEventListener("pointercancel", this._handleUp);
  }

  destroy() {
    this.cleanupListeners();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private reset() {
    this.isDragging = false;
    this.draggingId = null;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private get itemElements(): HTMLElement[] {
    if (!this.options.container) return [];
    return Array.from(this.options.container.children).filter((el) =>
      el.matches(this.options.itemSelector),
    ) as HTMLElement[];
  }

  private scrollTowardEdge() {
    const container = this.options.container;
    if (!container) return;
    const margin = this.options.edgeScrollMargin ?? DEFAULT_EDGE_SCROLL_MARGIN;
    const step = this.options.edgeScrollStep ?? DEFAULT_EDGE_SCROLL_STEP;
    const rect = container.getBoundingClientRect();
    if (this.currentDragX <= rect.left + margin) {
      container.scrollLeft -= step;
    } else if (this.currentDragX >= rect.right - margin) {
      container.scrollLeft += step;
    }
  }

  private sortFromPointer() {
    if (!this.draggingId) return;

    const items = this.options.items;
    const elements = this.itemElements;
    if (elements.length === 0) return;

    const draggedIndex = items.findIndex((item) => String(item[this.options.idKey]) === this.draggingId);
    if (draggedIndex === -1 || draggedIndex >= elements.length) return;

    // Count how many non-dragged tabs sit left of the pointer; that is the slot
    // the dragged tab should land in (the dragged tab itself is excluded).
    let targetIndex = 0;
    for (let i = 0; i < elements.length; i++) {
      if (i === draggedIndex) continue;
      const rect = elements[i].getBoundingClientRect();
      if (this.currentDragX <= rect.left + rect.width / 2) break;
      targetIndex += 1;
    }

    targetIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
    if (targetIndex === draggedIndex) return;

    const newItems = [...items];
    const [item] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, item);

    this.options.onSort(newItems);
  }
}
