import { tick, untrack } from 'svelte';
import { translate } from '$lib/i18n';
import { cachePreviewHeadings } from '$lib/stores/previewHeadings.svelte';
import { CONFIG } from '$lib/utils/config';
import { renderMarkdown } from '$lib/utils/markdownRust';
import { scrollSync } from '$lib/utils/scrollSync.svelte';

export class PreviewRenderer {
  isRendering = $state(false);
  showSpinner = $state(false);
  htmlContent = $state('');
  renderError = $state('');

  lastRendered = '';
  private lastTabId = '';
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private spinnerTimer: ReturnType<typeof setTimeout> | null = null;
  private renderAbortController: AbortController | null = null;

  onTabSwitch(tabId: string): void {
    if (this.lastTabId === tabId) return;
    this.lastTabId = tabId;
    this.lastRendered = '';
    this.htmlContent = '';
    this.renderError = '';
    this.cancelPending();
  }

  scheduleRender(
    content: string,
    flavor: string,
    tabPath: string | null | undefined,
    container: HTMLDivElement | undefined,
  ): () => void {
    this.cancelPending();

    this.renderError = '';
    this.isRendering = true;
    this.showSpinner = false;

    this.spinnerTimer = setTimeout(() => {
      this.showSpinner = true;
    }, CONFIG.PERFORMANCE.PREVIEW_SPINNER_DELAY_MS);

    const controller = new AbortController();
    this.renderAbortController = controller;

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      try {
        const result = await renderMarkdown(content, flavor === 'gfm', tabPath);
        if (controller.signal.aborted || !result) return;

        this.htmlContent = result.html;
        this.lastRendered = content;
        cachePreviewHeadings(content, result.headings);

        if (container) {
          scrollSync.registerPreview(container);
          scrollSync.markMapDirty();
          // Rebuild the line map after the Svelte flush so it reflects the new
          // tab's DOM (a synchronous build here would still read the previous
          // tab's rendered content, producing a mixed/stale map).
          void tick().then(() => untrack(() => scrollSync.updateMap()));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        this.lastRendered = content;
        this.renderError = err instanceof Error ? err.message : translate('preview.renderFailed');
      } finally {
        // Only the current render owns the shared state: a superseded render
        // (aborted by a newer scheduleRender or a tab switch) must not reset
        // flags that the new cycle already re-armed.
        if (this.renderAbortController === controller) {
          this.renderAbortController = null;
          this.resetRenderState();
          scrollSync.endTabSwitch(CONFIG.PERFORMANCE.TAB_SWITCH_SCROLL_SUPPRESS_MS);
        }
      }
    }, CONFIG.PERFORMANCE.PREVIEW_RENDER_DEBOUNCE_MS);

    return () => this.cancelPending();
  }

  /** Cancels pending timers and any in-flight render, then clears the render state. */
  private cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.renderAbortController) {
      this.renderAbortController.abort();
      this.renderAbortController = null;
    }
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
