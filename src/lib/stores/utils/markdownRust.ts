import { invoke } from '@tauri-apps/api/core';
import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';

export interface RenderResult {
    html: string;
    line_map: Record<number, number>;
}

/**
 * Renders markdown using the Rust backend
 */
export async function renderMarkdown(content: string, gfm: boolean = true): Promise<string> {
    try {
        const result = await invoke<RenderResult>('render_markdown_content', {
            content,
            gfm
        });

        // Sanitize the HTML returned from Rust
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
