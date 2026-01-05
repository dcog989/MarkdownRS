import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from '$lib/utils/backend';

export interface FormatterOptions {
    listIndent: number;
    codeBlockFence: '```' | '~~~';
    bulletChar: '-' | '*' | '+';
    tableAlignment: boolean;
}

export async function formatMarkdown(
    content: string,
    options: Partial<FormatterOptions> = {}
): Promise<string> {
    const defaults: FormatterOptions = {
        listIndent: appContext.app.defaultIndent,
        codeBlockFence: '```',
        bulletChar: '-',
        tableAlignment: true,
    };

    const final = { ...defaults, ...options };

    const apiOptions = {
        flavor: appContext.app.markdownFlavor,
        list_indent: final.listIndent,
        bullet_char: final.bulletChar,
        code_block_fence: final.codeBlockFence,
        table_alignment: final.tableAlignment,
    };

    try {
        return await callBackend('format_markdown', {
            content,
            ...apiOptions
        }, 'Markdown:Render', undefined, { report: true });
    } catch (e) {
        return content;
    }
}
