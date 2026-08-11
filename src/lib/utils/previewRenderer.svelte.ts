import { translate } from '$lib/i18n';
import { cachePreviewHeadings } from '$lib/stores/previewHeadings.svelte';
import { CONFIG } from '$lib/utils/config';
import { renderMarkdown } from '$lib/utils/markdownRust';

/** Lifecycle hooks owned by the preview component, keeping the renderer free of
 *  scroll-sync and DOM-registration concerns. */
export interface PreviewRendererCallbacks {
  /** A render's HTML was applied; rebuild any derived DOM state post-flush. */
  onContentRendered: () => void;
  /** The current render cycle settled (was not superseded); resume deferred work. */
  onRenderSettled: () => void;
}

export class PreviewRenderer {
  isRendering = $state(false);
  showSpinner = $state(false);
  htmlContent = $state('');
  renderError = $state('');

  lastRendered = '';
  lastTabId = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private spinnerTimer: ReturnType<typeof setTimeout> | null = null;
  /** Advances on every cancel/new schedule; in-flight renders capture it and bail when stale. */
  private renderEpoch = 0;

  constructor(private readonly callbacks: PreviewRendererCallbacks) {}

  onTabSwitch(tabId: string): void {
    if (this.lastTabId === tabId) return;
    this.lastTabId = tabId;
    this.lastRendered = '';
    this.htmlContent = '';
    this.renderError = '';
    this.cancelPending();
  }

  scheduleRender(content: string, flavor: string, tabPath: string | null | undefined): () => void {
    this.cancelPending();

    this.renderError = '';
    this.isRendering = true;
    this.showSpinner = false;

    this.spinnerTimer = setTimeout(() => {
      this.showSpinner = true;
    }, CONFIG.PERFORMANCE.PREVIEW_SPINNER_DELAY_MS);

    const epoch = ++this.renderEpoch;

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      try {
        const result = await renderMarkdown(content, flavor === 'gfm', tabPath);
        if (epoch !== this.renderEpoch || !result) return;

        this.htmlContent = result.html;
        this.lastRendered = content;
        cachePreviewHeadings(content, result.headings);
        this.callbacks.onContentRendered();
      } catch (err) {
        if (epoch !== this.renderEpoch) return;
        this.lastRendered = content;
        this.renderError = err instanceof Error ? err.message : translate('preview.renderFailed');
      } finally {
        // Only the current render owns the shared state: a superseded render
        // (invalidated by a newer scheduleRender or a tab switch) must not
        // reset flags that the new cycle already re-armed.
        if (epoch === this.renderEpoch) {
          this.resetRenderState();
          this.callbacks.onRenderSettled();
        }
      }
    }, CONFIG.PERFORMANCE.PREVIEW_RENDER_DEBOUNCE_MS);

    return () => this.cancelPending();
  }

  /** Cancels pending timers and invalidates any in-flight render, then clears the render state. */
  private cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.renderEpoch++;
    this.resetRenderState();
  }

  private resetRenderState(): void {
    this.isRendering = false;
    this.showSpinner = false;
    if (this.spinnerTimer) {
      clearTimeout(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  cleanup(): void {
    this.cancelPending();
  }
}
