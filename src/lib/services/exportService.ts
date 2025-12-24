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

    private async ensurePreviewVisible(): Promise<HTMLElement | null> {
        if (!appState.splitView) {
            toastStore.warning("Please open Split View (Ctrl+\\) to export.", 3000);
            return null;
        }

        // Allow DOM to settle if just opened
        return new Promise(resolve => {
            setTimeout(() => {
                const el = document.getElementById('active-preview-container');
                if (!el) {
                    toastStore.error("Could not find preview container.", 3000);
                    resolve(null);
                } else {
                    resolve(el);
                }
            }, 100);
        });
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

            // Render content
            const bodyContent = await renderMarkdown(tab.content, appState.markdownFlavor === 'gfm');

            // Get current theme CSS
            const themeCss = await getThemeCss(appState.activeTheme);

            // Construct full HTML
            const html = `<!DOCTYPE html>
<html lang="en" data-theme="${appState.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tab.title}</title>
    <style>
        ${themeCss}
        body { margin: 0; padding: 2rem; background-color: var(--color-bg-main); color: var(--color-fg-default); }
        .prose { max-width: 800px; margin: 0 auto; }
        /* Ensure theme variables map correctly if they rely on :root */
        :root {
            ${appState.theme === 'dark' ? 'color-scheme: dark;' : 'color-scheme: light;'}
        }
    </style>
</head>
<body>
    <div class="prose">
        ${bodyContent}
    </div>
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
        const tab = this.getActiveTab();
        if (!tab) return;

        // Check for split view
        if (!appState.splitView) {
            toastStore.warning("Opening preview for PDF export...", 2000);
            appState.toggleSplitView();
            // Wait for render
            setTimeout(() => window.print(), 500);
        } else {
            window.print();
        }
    }

    async exportToImage(format: 'png' | 'webp' | 'svg') {
        const tab = this.getActiveTab();
        if (!tab) return;

        const node = await this.ensurePreviewVisible();
        if (!node) return;

        try {
            const path = await save({
                defaultPath: `${tab.title.replace(/\.[^/.]+$/, "")}.${format}`,
                filters: [{ name: format.toUpperCase(), extensions: [format] }]
            });

            if (!path) return;

            const toastId = "export-img";
            toastStore.info("Generating image...", 2000);

            // Options for html-to-image
            const options = {
                backgroundColor: getComputedStyle(document.body).getPropertyValue('--color-bg-main'),
                style: {
                    margin: '0',
                    overflow: 'visible' // Capture full scroll height
                }
            };

            let dataUrl = '';
            if (format === 'png') dataUrl = await htmlToImage.toPng(node, options);
            else if (format === 'webp') dataUrl = await htmlToImage.toWebp(node, options);
            else if (format === 'svg') dataUrl = await htmlToImage.toSvg(node, options);

            // Remove header
            const base64Data = dataUrl.split(',')[1];

            // Convert base64 to binary array
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Send as number array to Rust (tauri auto-converts TypedArrays or arrays)
            await callBackend('write_binary_file', { path, content: Array.from(bytes) }, 'File:Write');

            toastStore.success(`Exported to ${path}`);
        } catch (err) {
            console.error(err);
            toastStore.error(`Failed to export to ${format.toUpperCase()}`);
        }
    }
}

export const exportService = new ExportService();
