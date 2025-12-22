import { callBackend } from './backend';

export interface FormatterOptions {
    listIndent: number;
    codeBlockFence: '```' | '~~~';
    bulletChar: '-' | '*' | '+';
    tableAlignment: boolean;
}

/**
 * Format markdown content using the Rust backend via unified bridge
 */
export async function formatMarkdown(
    content: string,
    options: Partial<FormatterOptions> = {}
): Promise<string> {
    const defaults: FormatterOptions = {
        listIndent: 2,
        codeBlockFence: '```',
        bulletChar: '-',
        tableAlignment: true,
    };

    const final = { ...defaults, ...options };

    try {
        return await callBackend<string>('format_markdown_content', {
            content,
            listIndent: final.listIndent,
            bulletChar: final.bulletChar,
            codeBlockFence: final.codeBlockFence,
            tableAlignment: final.tableAlignment,
        }, 'Markdown:Render');
    } catch (e) {
        return content;
    }
}
