import { save } from '@tauri-apps/plugin-dialog';
import { domToPng, domToSvg, domToWebp } from 'modern-screenshot';
import { translate } from '$lib/i18n';
import type { EditorTab } from '$lib/stores/editorTypes';
import { appContext } from '$lib/stores/state.svelte';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { AppError } from '$lib/utils/errorHandling';
import { logger } from '$lib/utils/logger';
import { renderMarkdown } from '$lib/utils/markdownRust';
import { buildExportHtml } from './exportTemplates';

export class ExportService {
  private getActiveTab() {
    const tabId = appContext.app.activeTabId;
    if (!tabId) return null;
    return appContext.editor.tabs.find((t) => t.id === tabId) || null;
  }

  private getExportContainer(): HTMLElement {
    let container = document.getElementById('export-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'export-container';
      container.className = 'prose preview-root';
      container.setAttribute('aria-hidden', 'true');
      document.body.appendChild(container);
    }
    return container;
  }

  private async prepareExportContent(tab: EditorTab): Promise<HTMLElement | null> {
    const container = this.getExportContainer();

    try {
      const result = await renderMarkdown(tab.content, appContext.settings.markdownFlavor === 'gfm', tab.path);
      container.innerHTML = result.html;
    } catch (err) {
      AppError.handle('Export:HTML', err, {
        showToast: true,
        userMessage: translate('export.failedRender'),
      });
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIG.UI_TIMING.EXPORT_RENDER_WAIT_MS));

    return container;
  }

  private clearExportContent() {
    const container = document.getElementById('export-container');
    if (container) container.innerHTML = '';
  }

  private getComputedCssVariables(): string {
    const styles = getComputedStyle(document.documentElement);
    let cssVars = ':root {\n';
    for (let i = 0; i < styles.length; i++) {
      const prop = styles[i];
      if (prop.startsWith('--')) {
        cssVars += `    ${prop}: ${styles.getPropertyValue(prop)};\n`;
      }
    }
    cssVars += '}';
    return cssVars;
  }

  async exportToHtml() {
    const tab = this.getActiveTab();
    if (!tab) return;

    try {
      const path = await save({
        defaultPath: `${tab.title.replace(/\.[^/.]+$/, '')}.html`,
        filters: [{ name: translate('export.htmlFilter'), extensions: ['html'] }],
      });

      if (!path) return;

      const result = await renderMarkdown(tab.content, appContext.settings.markdownFlavor === 'gfm', tab.path);

      const baseVars = this.getComputedCssVariables();
      const html = buildExportHtml(
        tab.title,
        result.html,
        appContext.settings.theme,
        appContext.settings.previewFontFamily,
        baseVars,
      );

      await callBackend(
        'write_text_file',
        { path, content: html },
        'File:Write',
        { path: tab?.path },
        { report: true, msg: translate('export.failedSaveHtml') },
      );
      showToast('success', translate('export.exportedTo', { values: { path } }));
    } catch (err) {
      logger.file.warn('ExportHtmlFailed', { error: String(err) });
    }
  }

  async exportToPdf() {
    const tab = this.getActiveTab();
    if (!tab) return;

    try {
      const path = await save({
        defaultPath: `${tab.title.replace(/\.[^/.]+$/, '')}.pdf`,
        filters: [{ name: translate('export.pdfFilter'), extensions: ['pdf'] }],
      });

      if (!path) return;

      showToast('info', translate('export.generatingPdf'));

      const computedStyle = getComputedStyle(document.documentElement);
      const bgColor = computedStyle.getPropertyValue('--surface-1').trim() || null;

      await callBackend(
        'export_to_pdf',
        { path, content: tab.content, backgroundColor: bgColor },
        'Export:PDF',
        { path: tab?.path },
        { report: true, msg: translate('export.failedGeneratePdf') },
      );
      showToast('success', translate('export.exportedTo', { values: { path } }));
    } catch (err) {
      logger.file.warn('ExportPdfFailed', { error: String(err) });
    }
  }

  async exportToImage(format: 'png' | 'webp' | 'svg') {
    const tab = this.getActiveTab();
    if (!tab) {
      showToast('error', translate('export.noActiveTab'));
      return;
    }

    const container = await this.prepareExportContent(tab);
    if (!container) return;

    try {
      const path = await save({
        defaultPath: `${tab.title.replace(/\.[^/.]+$/, '')}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });

      if (!path) return;

      showToast('info', translate('export.generatingImage'));

      const computedStyle = getComputedStyle(document.documentElement);
      const bgColor = computedStyle.getPropertyValue('--surface-1').trim() || '#ffffff';

      const targetWidth = 1200;
      const scale = targetWidth / container.scrollWidth;

      const options = {
        backgroundColor: bgColor,
        scale,
        style: {
          position: 'static',
          left: 'auto',
          top: 'auto',
          margin: '0',
          transform: 'none',
        },
      };

      let dataUrl = '';
      if (format === 'png') {
        dataUrl = await domToPng(container, options);
      } else if (format === 'webp') {
        dataUrl = await domToWebp(container, options);
      } else if (format === 'svg') {
        dataUrl = await domToSvg(container, options);
      }

      if (format === 'svg') {
        const svgContent = decodeURIComponent(dataUrl.split(',')[1]);
        await callBackend(
          'write_text_file',
          { path, content: svgContent },
          'File:Write',
          { path: tab?.path },
          { report: true, msg: translate('export.failedSaveFormat', { values: { format: 'SVG' } }) },
        );
      } else {
        const base64Data = dataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        await callBackend(
          'write_binary_file',
          { path, content: bytes },
          'File:Write',
          { path: tab?.path },
          { report: true, msg: translate('export.failedSaveFormat', { values: { format: format.toUpperCase() } }) },
        );
      }
      showToast('success', translate('export.exportedTo', { values: { path } }));
    } catch (err) {
      logger.file.warn('ExportImageFailed', { error: String(err) });
    } finally {
      this.clearExportContent();
    }
  }
}

export const exportService = new ExportService();
