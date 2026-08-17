type SortableOptions<T> = {
  items: T[];
  idKey: keyof T;
  container: HTMLElement | undefined;
  itemSelector: string;
  onSort: (newItems: T[]) => void;
  onDragStart: (id: string, startX: number, offset: number) => void;
  onDragMove: (currentX: number) => void;
  onDragEnd: () => void;
};

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
  private options: SortableOptions<T>;
  private isDragging = false;
  private draggingId: string | null = null;
  private startX = 0;
  private currentX = 0;
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
    if (target.closest('.close-btn-wrapper') || target.closest('button')) return;

    e.preventDefault();

    this.activeWrapper = wrapper;
    wrapper.setPointerCapture(e.pointerId);

    this.draggingId = id;
    this.isDragging = false;
    this.startX = e.clientX;
    this.currentX = e.clientX;

    const rect = wrapper.getBoundingClientRect();
    const offset = e.clientX - rect.left;

    this.options.onDragStart(id, e.clientX, offset);

    window.addEventListener('pointermove', this._handleMove);
    window.addEventListener('pointerup', this._handleUp);
    window.addEventListener('pointercancel', this._handleUp);
  }

  handleMove(e: PointerEvent) {
    if (!this.draggingId) return;

    this.currentX = e.clientX;

    if (!this.isDragging) {
      if (Math.abs(e.clientX - this.startX) > 5) {
        this.isDragging = true;
      } else {
        return;
      }
    }

    this.options.onDragMove(e.clientX);

    if (this.rafId) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.sortFromPointer();
    });
  }

  handleUp(e: PointerEvent) {
    if (!this.draggingId) return;

    if (this.activeWrapper) {
      this.activeWrapper.releasePointerCapture(e.pointerId);
      this.activeWrapper = null;
    }

    this.cleanupListeners();
    this.options.onDragEnd();
    this.reset();
  }

  private cleanupListeners() {
    window.removeEventListener('pointermove', this._handleMove);
    window.removeEventListener('pointerup', this._handleUp);
    window.removeEventListener('pointercancel', this._handleUp);
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
      if (this.currentX <= rect.left + rect.width / 2) break;
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
