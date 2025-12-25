import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { callBackend } from './backend';

export interface RenderResult {
    html: string;
    line_map: Record<number, number>;
}

/**
 * Renders markdown using the Rust backend
 * File path linkification is now handled in Rust for better performance
 */
export async function renderMarkdown(content: string, gfm: boolean = true): Promise<string> {
    try {
        // Map boolean GFM to flavor string expected by backend
        const flavor = gfm ? 'gfm' : 'commonmark';
        const result = await callBackend<RenderResult>('render_markdown', {
            content,
            flavor
        }, 'Markdown:Render');

        // Sanitize HTML (file paths are already linkified by Rust backend)
        const cleanHtml = DOMPurify.sanitize(result.html, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
        });

        return cleanHtml;
    } catch (e) {
        await error(`[Markdown] Render error: ${e}`);
        return `<div style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b;">
            <strong>Preview Error:</strong><br/>${String(e)}
        </div>`;
    }
}
