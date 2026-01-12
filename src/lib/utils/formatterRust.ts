import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackend } from '$lib/utils/backend';

export interface FormatterOptions {
    listIndent: number;
    codeBlockFence: '```' | '~~~';
    bulletChar: '-' | '*' | '+';
    tableAlignment: boolean;
}

export async function formatMarkdown(content: string, options: Partial<FormatterOptions> = {}): Promise<string> {
    const defaults: FormatterOptions = {
        listIndent: appContext.app.defaultIndent,
        codeBlockFence: '```',
        bulletChar: '-',
        tableAlignment: true,
    };

    const final = { ...defaults, ...options };

    const apiOptions = {
        flavor: appContext.app.markdownFlavor,
        listIndent: final.listIndent,
        bulletChar: final.bulletChar,
        codeBlockFence: final.codeBlockFence,
        tableAlignment: final.tableAlignment,
    };

    try {
        const result = await callBackend(
            'format_markdown',
            {
                content,
                ...apiOptions,
            },
            'Markdown:Render',
            undefined,
            { report: true },
        );
        return result ?? content;
    } catch (e) {
        return content;
    }
}
