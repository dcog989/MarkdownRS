import { untrack } from 'svelte';
import { updateTabFields } from '$lib/stores/editorStore.svelte';
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
    if (this.lastTabId !== tabId) {
      this.lastTabId = tabId;
      this.lastRendered = '';
      this.htmlContent = '';
      this.renderError = '';
      if (this.renderAbortController) {
        this.renderAbortController.abort();
        this.renderAbortController = null;
      }
    }
  }

  scheduleRender(
    content: string,
    tabId: string,
    flavor: string,
    tabPath: string | null | undefined,
    container: HTMLDivElement | undefined,
  ): () => void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.spinnerTimer) clearTimeout(this.spinnerTimer);
    if (this.renderAbortController) this.renderAbortController.abort();

    this.renderError = '';
    this.isRendering = true;
    this.showSpinner = false;

    this.spinnerTimer = setTimeout(() => {
      this.showSpinner = true;
    }, CONFIG.PERFORMANCE.PREVIEW_SPINNER_DELAY_MS);

    this.debounceTimer = setTimeout(async () => {
      this.renderAbortController = new AbortController();
      const currentController = this.renderAbortController;

      try {
        const result = await renderMarkdown(content, flavor === 'gfm', tabPath);

        if (currentController.signal.aborted || !result) return;

        updateTabFields(tabId, { wordCount: result.word_count });

        this.htmlContent = result.html;
        this.lastRendered = content;

        if (container) {
          scrollSync.registerPreview(container);
          scrollSync.markMapDirty();
          untrack(() => scrollSync.updateMap());
        }

        if (!currentController.signal.aborted) {
          this.isRendering = false;
          this.showSpinner = false;
          if (this.spinnerTimer) clearTimeout(this.spinnerTimer);
        }
      } catch (err) {
        if (!currentController.signal.aborted) {
          this.lastRendered = content;
          this.renderError = err instanceof Error ? err.message : 'Preview render failed';
        }
      } finally {
        if (!currentController.signal.aborted) {
          this.isRendering = false;
          this.showSpinner = false;
          if (this.spinnerTimer) clearTimeout(this.spinnerTimer);
        }
      }
    }, CONFIG.PERFORMANCE.PREVIEW_RENDER_DEBOUNCE_MS);

    return () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      if (this.spinnerTimer) clearTimeout(this.spinnerTimer);
    };
  }

  cleanup(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.spinnerTimer) clearTimeout(this.spinnerTimer);
    if (this.renderAbortController) this.renderAbortController.abort();
  }
}
