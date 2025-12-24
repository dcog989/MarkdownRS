import { appState } from '$lib/stores/appState.svelte';
import { editorStore } from '$lib/stores/editorStore.svelte';
import { toastStore } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { renderMarkdown } from '$lib/utils/markdownRust';
import { getThemeCss } from '$lib/utils/themes';
import { save } from '@tauri-apps/plugin-dialog';
import * as htmlToImage from 'html-to-image';

export class ExportService {

    private getActiveTab() {
        const tabId = appState.activeTabId;
        if (!tabId) return null;
        return editorStore.tabs.find(t => t.id === tabId) || null;
    }

    private getExportContainer(): HTMLElement {
        let container = document.getElementById('export-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'export-container';
            container.className = 'prose';
            // Accessibility: hidden from screen readers during normal use
            container.setAttribute('aria-hidden', 'true');
            document.body.appendChild(container);
        }
        return container;
    }

    private async prepareExportContent(): Promise<HTMLElement | null> {
        const tab = this.getActiveTab();
        if (!tab) {
            toastStore.error("No active tab to export.");
            return null;
        }

        const container = this.getExportContainer();

        // Render Markdown to HTML
        const html = await renderMarkdown(tab.content, appState.markdownFlavor === 'gfm');
        container.innerHTML = html;

        // Wait for DOM update/images to load
        // A small delay ensures the browser layout engine has calculated sizes
        await new Promise(resolve => setTimeout(resolve, 150));

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
                defaultPath: `${tab.title.replace(/\.[^/.]+$/, "")}.html`,
                filters: [{ name: 'HTML', extensions: ['html'] }]
            });

            if (!path) return;

            const bodyContent = await renderMarkdown(tab.content, appState.markdownFlavor === 'gfm');
            const themeCss = await getThemeCss(appState.activeTheme);
            const baseVars = this.getComputedCssVariables();

            const html = `<!DOCTYPE html>
<html lang="en" data-theme="${appState.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tab.title}</title>
    <style>
        ${baseVars}
        ${themeCss}
        body { margin: 0; padding: 2rem; background-color: var(--color-bg-main); color: var(--color-fg-default); font-family: ${appState.previewFontFamily}; }
        .prose { max-width: 800px; margin: 0 auto; line-height: 1.6; }
        .prose h1 { border-bottom: 1px solid var(--color-border-main); padding-bottom: 0.3em; }
        .prose pre { background-color: var(--color-bg-code); padding: 1em; border-radius: 4px; overflow: auto; }
        .prose code { background-color: var(--color-bg-code); padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; }
        .prose blockquote { border-left: 4px solid var(--color-border-quote); background: var(--color-bg-quote); padding: 0.5em 1em; margin: 1em 0; }
        .prose table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .prose th, .prose td { border: 1px solid var(--color-border-main); padding: 0.5em; text-align: left; }
    </style>
</head>
<body>
    <div class="prose">${bodyContent}</div>
</body>
</html>`;

            await callBackend('write_text_file', { path, content: html }, 'File:Write');
            toastStore.success(`Exported to ${path}`);
        } catch (err) {
            console.error(err);
            toastStore.error("Failed to export HTML");
        }
    }

    async exportToPdf() {
        const container = await this.prepareExportContent();
        if (!container) return;

        try {
            // Directly trigger print without showing the container on screen
            window.print();
        } catch (e) {
            console.error('[Export] window.print() failed:', e);
        } finally {
            // Clear after a delay to allow print dialog to read the content
            setTimeout(() => this.clearExportContent(), 500);
        }
    }

    async exportToImage(format: 'png' | 'webp' | 'svg') {
        const container = await this.prepareExportContent();
        if (!container) return;

        const tab = this.getActiveTab();
        if (!tab) return;

        try {
            const path = await save({
                defaultPath: `${tab.title.replace(/\.[^/.]+$/, "")}.${format}`,
                filters: [{ name: format.toUpperCase(), extensions: [format] }]
            });

            if (!path) return;

            toastStore.info("Generating image...", 2000);

            const options = {
                backgroundColor: '#ffffff',
                width: container.scrollWidth,
                height: container.scrollHeight,
                style: {
                    position: 'static',
                    left: 'auto',
                    top: 'auto',
                    margin: '0',
                    transform: 'none'
                }
            };

            let dataUrl = '';
            if (format === 'png') {
                dataUrl = await htmlToImage.toPng(container, options);
            } else if (format === 'webp') {
                const canvas = await htmlToImage.toCanvas(container, options);
                dataUrl = canvas.toDataURL('image/webp');
            } else if (format === 'svg') {
                dataUrl = await htmlToImage.toSvg(container, options);
            }

            const base64Data = dataUrl.split(',')[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            await callBackend('write_binary_file', { path, content: Array.from(bytes) }, 'File:Write');
            toastStore.success(`Exported to ${path}`);
        } catch (err) {
            console.error(err);
            toastStore.error(`Failed to export to ${format.toUpperCase()}`);
        } finally {
            this.clearExportContent();
        }
    }
}

export const exportService = new ExportService();
