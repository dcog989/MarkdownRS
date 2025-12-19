import { invoke } from '@tauri-apps/api/core';

export interface FormatterOptions {
    listIndent: number;
    codeBlockFence: '```' | '~~~';
    bulletChar: '-' | '*' | '+';
    tableAlignment: boolean;
}

/**
 * Format markdown content using the Rust backend
 */
export async function formatMarkdown(
    content: string,
    options: Partial<FormatterOptions> = {}
): Promise<string> {
    const defaultOptions: FormatterOptions = {
        listIndent: 2,
        codeBlockFence: '```',
        bulletChar: '-',
        tableAlignment: true,
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
        const result = await invoke<string>('format_markdown_content', {
            content,
            listIndent: finalOptions.listIndent,
            bulletChar: finalOptions.bulletChar,
            codeBlockFence: finalOptions.codeBlockFence,
            tableAlignment: finalOptions.tableAlignment,
        });
        return result;
    } catch (e) {
        console.error('[Formatter] Error formatting markdown:', e);
        // Fallback to returning original content on error
        return content;
    }
}
