type SortableOptions<T> = {
    items: T[];
    idKey: keyof T;
    container: HTMLElement | undefined;
    onSort: (newItems: T[]) => void;
    onDragStart: (id: string, startX: number, offset: number) => void;
    onDragMove: (currentX: number) => void;
    onDragEnd: () => void;
};

export class SortableController<T> {
    private options: SortableOptions<T>;
    private isDragging = false;
    private draggingId: string | null = null;
    private dragStartX = 0;
    private currentDragX = 0;
    private layoutCache: { center: number; width: number }[] = [];
    private rafId: number | null = null;

    constructor(options: SortableOptions<T>) {
        this.options = options;
    }

    updateOptions(newOptions: Partial<SortableOptions<T>>) {
        this.options = { ...this.options, ...newOptions };
    }

    startDrag(e: PointerEvent, id: string, wrapper: HTMLElement) {
        if (e.button !== 0) return;

        // Ignore clicks on close buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest(".close-btn-wrapper") || target.closest("button")) return;

        e.preventDefault();
        wrapper.setPointerCapture(e.pointerId);

        this.draggingId = id;
        this.isDragging = false;
        this.dragStartX = e.clientX;
        this.currentDragX = e.clientX;

        const rect = wrapper.getBoundingClientRect();
        const offset = e.clientX - rect.left;

        // Cache layout
        if (this.options.container) {
            this.layoutCache = Array.from(this.options.container.children)
                .filter((el) => el.getAttribute("role") === "listitem")
                .map((el) => {
                    const r = el.getBoundingClientRect();
                    return { center: r.left + r.width / 2, width: r.width };
                });
        }

        this.options.onDragStart(id, e.clientX, offset);
    }

    handleMove(e: PointerEvent) {
        if (!this.draggingId) return;

        this.currentDragX = e.clientX;

        if (!this.isDragging) {
            if (Math.abs(e.clientX - this.dragStartX) > 5) {
                this.isDragging = true;
            } else {
                return;
            }
        }

        this.options.onDragMove(e.clientX);

        if (this.rafId) return;

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.calculateSwap();
        });
    }

    handleUp(e: PointerEvent, wrapper?: HTMLElement) {
        if (!this.draggingId) return;

        if (wrapper) {
            wrapper.releasePointerCapture(e.pointerId);
        }

        this.options.onDragEnd();
        this.reset();
    }

    private reset() {
        this.isDragging = false;
        this.draggingId = null;
        this.layoutCache = [];
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private calculateSwap() {
        if (!this.draggingId) return;

        // Find index of dragged item in current list
        const currentIndex = this.options.items.findIndex((item) => String(item[this.options.idKey]) === this.draggingId);
        if (currentIndex === -1) return;

        const currentCenter = this.layoutCache[currentIndex]?.center || 0;
        const deltaX = this.currentDragX - this.dragStartX;
        let targetIndex = currentIndex;

        // Swap Right
        if (deltaX > 0 && currentIndex < this.layoutCache.length - 1) {
            const rightTab = this.layoutCache[currentIndex + 1];
            const swapThreshold = currentCenter + (rightTab.center - currentCenter) / 2;
            if (this.currentDragX > swapThreshold) targetIndex = currentIndex + 1;
        }
        // Swap Left
        else if (deltaX < 0 && currentIndex > 0) {
            const leftTab = this.layoutCache[currentIndex - 1];
            const swapThreshold = this.layoutCache[currentIndex - 1].center + (currentCenter - this.layoutCache[currentIndex - 1].center) / 2;
            if (this.currentDragX < swapThreshold) targetIndex = currentIndex - 1;
        }

        if (targetIndex !== currentIndex) {
            const newItems = [...this.options.items];
            const [item] = newItems.splice(currentIndex, 1);
            newItems.splice(targetIndex, 0, item);

            this.options.onSort(newItems);

            // Re-cache layout after DOM update
            setTimeout(() => {
                if (this.options.container) {
                    this.layoutCache = Array.from(this.options.container.children)
                        .filter((el) => el.getAttribute("role") === "listitem")
                        .map((el) => {
                            const r = el.getBoundingClientRect();
                            return { center: r.left + r.width / 2, width: r.width };
                        });
                    this.dragStartX = this.currentDragX;
                }
            }, 0);
        }
    }
}
