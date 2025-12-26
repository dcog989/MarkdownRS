export type MarkdownFlavor = 'commonmark' | 'gfm';

export interface FormatterOptions {
    flavor?: MarkdownFlavor;
    list_indent?: number;
    bullet_char?: '-' | '*' | '+';
    code_block_fence?: '```' | '~~~';
    table_alignment?: boolean;
}

export interface RenderResult {
    html: string;
    line_map: Record<number, number>;
}
