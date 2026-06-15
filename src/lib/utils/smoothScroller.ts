import { CONFIG } from '$lib/utils/config';

export class SmoothScroller {
  private raf: number | null = null;
  private target: { element: HTMLElement | Element; targetY: number } | null = null;

  scrollTo(element: HTMLElement | Element, targetY: number, instant = false) {
    const currentY = element.scrollTop;
    const diff = Math.abs(targetY - currentY);

    if (diff < CONFIG.PERFORMANCE.SCROLL_SYNC_THRESHOLD_PX) return;

    if (instant || diff < 50) {
      element.scrollTop = targetY;
      return;
    }

    if (this.target && this.target.element === element && Math.abs(this.target.targetY - targetY) < 100) {
      this.target.targetY = targetY;
      return;
    }

    if (this.raf) {
      cancelAnimationFrame(this.raf);
    }

    this.target = { element, targetY };

    const startY = currentY;
    const duration = Math.min(150, Math.max(50, diff / 10));
    const startTime = performance.now();

    const animate = (now: number) => {
      if (!this.target || this.target.element !== element) {
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) ** 3;

      const currentTargetY = this.target.targetY;
      const y = startY + (currentTargetY - startY) * eased;

      element.scrollTop = y;

      if (progress < 1) {
        this.raf = requestAnimationFrame(animate);
      } else {
        this.raf = null;
        this.target = null;
      }
    };

    this.raf = requestAnimationFrame(animate);
  }

  stop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.target = null;
  }
}
