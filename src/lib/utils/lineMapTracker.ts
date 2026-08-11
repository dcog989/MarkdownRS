import { CONFIG } from '$lib/utils/config';

/**
 * Owns the preview resize observation that invalidates the editor<->preview
 * line map. A rebuild only happens while the map is marked dirty (i.e. content
 * was re-rendered); resize events debounce, then coalesce onto a single
 * animation frame, before invoking the rebuild callback.
 */
export class LineMapTracker {
  private resizeObserver: ResizeObserver | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(private readonly onUpdate: () => void) {}

  setTarget(target: HTMLElement | null): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (!target) return;

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.dirty) return;
      if (this.updateTimer) clearTimeout(this.updateTimer);
      this.updateTimer = setTimeout(() => {
        this.updateTimer = null;
        this.dirty = false;
        requestAnimationFrame(() => this.onUpdate());
      }, CONFIG.PERFORMANCE.SCROLL_SYNC_RESIZE_DEBOUNCE_MS);
    });
    this.resizeObserver.observe(target);
  }

  markDirty(): void {
    this.dirty = true;
  }
}
