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

    /**
     * Prepares the off-screen export container with the rendered content.
     * This avoids messing with the live preview pane.
     */
    private async prepareExportContent(): Promise<HTMLElement | null> {
        const tab = this.getActiveTab();
        if (!tab) {
            toastStore.error("No active tab to export.");
            return null;
        }

        const container = document.getElementById('export-container');
        if (!container) {
            toastStore.error("Export container not initialized.");
            return null;
        }

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

        // Print
        // Because of the @media print CSS in app.css, only #export-container will show
        window.print();

        // Cleanup
        // We delay cleanup slightly to ensure print dialog has captured the content
        setTimeout(() => this.clearExportContent(), 1000);
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

            // We need to temporarily force the container to be visible on screen for html-to-image to work reliably
            // changing z-index or opacity just for the capture moment
            // However, since it is fixed positioned off-screen, html-to-image might clip it.
            // We clone styling logic specifically for the capture.
            const options = {
                backgroundColor: '#ffffff',
                width: container.scrollWidth,
                height: container.scrollHeight,
                style: {
                    // Reset position for the capture canvas
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
