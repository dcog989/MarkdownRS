import { appContext } from '$lib/stores/state.svelte.ts';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { AppError } from '$lib/utils/errorHandling';
import { renderMarkdown } from '$lib/utils/markdownRust';
import { save } from '@tauri-apps/plugin-dialog';
import { domToPng, domToWebp, domToSvg } from 'modern-screenshot';

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
            container.className = 'prose';
            container.setAttribute('aria-hidden', 'true');
            document.body.appendChild(container);
        }
        return container;
    }

    private async prepareExportContent(): Promise<HTMLElement | null> {
        const tab = this.getActiveTab();
        if (!tab) {
            showToast('error', 'No active tab to export.');
            return null;
        }

        const container = this.getExportContainer();

        try {
            const result = await renderMarkdown(
                tab.content,
                appContext.app.markdownFlavor === 'gfm',
                tab.path,
            );
            container.innerHTML = result.html;
        } catch (err) {
            AppError.handle('Export:HTML', err, {
                showToast: true,
                userMessage: 'Failed to render markdown for export',
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
                filters: [{ name: 'HTML', extensions: ['html'] }],
            });

            if (!path) return;

            const result = await renderMarkdown(
                tab.content,
                appContext.app.markdownFlavor === 'gfm',
                tab.path,
            );
            const bodyContent = result.html;

            // Extract the native preview styles we added to app.css for the export container
            // This ensures the exported HTML looks exactly like the preview
            const baseVars = this.getComputedCssVariables();

            const html = `<!DOCTYPE html>
<html lang="en" data-theme="${appContext.app.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tab.title}</title>
    <style>
        ${baseVars}
        body {
            margin: 0;
            padding: 2rem;
            background-color: var(--color-bg-main);
            color: var(--preview-fg-body);
            font-family: ${appContext.app.previewFontFamily};
            line-height: 1.6;
        }
        .prose { max-width: 800px; margin: 0 auto; }

        h1, h2, h3, h4, h5, h6 { color: var(--preview-fg-heading); font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 2em; border-bottom: 1px solid var(--color-border-main); padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid var(--color-border-main); padding-bottom: 0.3em; }

        a { color: var(--preview-fg-link); text-decoration: underline; }

        code {
            color: var(--preview-fg-code);
            background-color: var(--preview-bg-code);
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-family: monospace;
        }

        pre {
            background-color: var(--preview-bg-pre);
            color: var(--preview-fg-pre);
            padding: 1em;
            border-radius: 4px;
            overflow: auto;
            margin: 1em 0;
        }

        pre code { background: transparent; padding: 0; color: inherit; }

        blockquote {
            color: var(--preview-fg-quote);
            background-color: var(--preview-bg-quote);
            border-left: 4px solid var(--preview-border-quote);
            padding: 0.5em 1em;
            margin: 1em 0;
            font-style: italic;
        }

        table { width: 100%; border-collapse: collapse; margin: 1em 0; }
        th, td { border: 1px solid var(--color-border-main); padding: 0.5em; text-align: left; }
        img { max-width: 100%; height: auto; }
        hr { border: 0; border-top: 1px solid var(--color-border-main); margin: 2em 0; }
    </style>
</head>
<body>
    <div class="prose">${bodyContent}</div>
</body>
</html>`;

            await callBackend(
                'write_text_file',
                { path, content: html },
                'File:Write',
                { path: tab?.path },
                { report: true, msg: 'Failed to save HTML file' },
            );
            showToast('success', `Exported to ${path}`);
        } catch {
            // Error already reported by backend
        }
    }

    async exportToPdf() {
        const tab = this.getActiveTab();
        if (!tab) return;

        try {
            const path = await save({
                defaultPath: `${tab.title.replace(/\.[^/.]+$/, '')}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });

            if (!path) return;

            showToast('info', 'Generating PDF...');

            const computedStyle = getComputedStyle(document.documentElement);
            const bgColor = computedStyle.getPropertyValue('--color-bg-main').trim() || null;

            await callBackend(
                'export_to_pdf',
                { path, content: tab.content, title: tab.title, backgroundColor: bgColor },
                'Export:PDF',
                { path: tab?.path },
                { report: true, msg: 'Failed to generate PDF' },
            );
            showToast('success', `Exported to ${path}`);
        } catch {
            // Error already reported
        }
    }

    async exportToImage(format: 'png' | 'webp' | 'svg') {
        const container = await this.prepareExportContent();
        if (!container) return;

        const tab = this.getActiveTab();
        if (!tab) return;

        try {
            const path = await save({
                defaultPath: `${tab.title.replace(/\.[^/.]+$/, '')}.${format}`,
                filters: [{ name: format.toUpperCase(), extensions: [format] }],
            });

            if (!path) return;

            showToast('info', 'Generating image...');

            const computedStyle = getComputedStyle(document.documentElement);
            const bgColor = computedStyle.getPropertyValue('--color-bg-main').trim() || '#ffffff';

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
                    { report: true, msg: 'Failed to save SVG' },
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
                    { path, content: Array.from(bytes) },
                    'File:Write',
                    { path: tab?.path },
                    { report: true, msg: `Failed to save ${format.toUpperCase()}` },
                );
            }
            showToast('success', `Exported to ${path}`);
        } catch {
            // Error already reported
        } finally {
            this.clearExportContent();
        }
    }
}

export const exportService = new ExportService();
