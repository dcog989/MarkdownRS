import { appState } from '$lib/stores/appState.svelte';
import { formatMarkdown as formatMarkdownAPI, type FormatterOptions as FormatterOptionsAPI } from './markdown';

export interface FormatterOptions {
    listIndent: number;
    codeBlockFence: '```' | '~~~';
    bulletChar: '-' | '*' | '+';
    tableAlignment: boolean;
}

/**
 * Format markdown content using the new comrak-based formatter
 */
export async function formatMarkdown(
    content: string,
    options: Partial<FormatterOptions> = {}
): Promise<string> {
    const defaults: FormatterOptions = {
        listIndent: appState.defaultIndent, // Use the shared setting
        codeBlockFence: '```',
        bulletChar: '-',
        tableAlignment: true,
    };

    const final = { ...defaults, ...options };

    const apiOptions: FormatterOptionsAPI = {
        flavor: appState.markdownFlavor,
        list_indent: final.listIndent,
        bullet_char: final.bulletChar,
        code_block_fence: final.codeBlockFence,
        table_alignment: final.tableAlignment,
    };

    try {
        return await formatMarkdownAPI(content, apiOptions);
    } catch (e) {
        console.error('Failed to format markdown:', e);
        return content;
    }
}
