// TypeScript interfaces and functions for comrak-based markdown commands

import { invoke } from '@tauri-apps/api/core';

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

/**
 * Render markdown using the comrak engine
 * 
 * @param content - The markdown content to render
 * @param flavor - Markdown flavor ('commonmark' or 'gfm'), defaults to 'gfm'
 * @returns Rendered HTML with line mapping for scroll sync
 * 
 * @example
 * ```typescript
 * const result = await renderMarkdown('# Hello\n\nWorld', 'gfm');
 * console.log(result.html); // <h1>Hello</h1><p>World</p>
 * ```
 */
export async function renderMarkdown(
  content: string,
  flavor?: MarkdownFlavor
): Promise<RenderResult> {
  return invoke('render_markdown', { content, flavor });
}

/**
 * Format markdown using the comrak engine
 * 
 * @param content - The markdown content to format
 * @param options - Formatting options
 * @returns Formatted markdown string
 * 
 * @example
 * ```typescript
 * const formatted = await formatMarkdown('*  item1\n+  item2', {
 *   bullet_char: '-',
 *   list_indent: 2
 * });
 * // Returns: "- item1\n- item2\n"
 * ```
 */
export async function formatMarkdown(
  content: string,
  options?: FormatterOptions
): Promise<string> {
  return invoke('format_markdown', {
    content,
    flavor: options?.flavor,
    list_indent: options?.list_indent,
    bullet_char: options?.bullet_char,
    code_block_fence: options?.code_block_fence,
    table_alignment: options?.table_alignment,
  });
}

/**
 * Get list of supported markdown flavors
 * 
 * @returns Array of flavor names
 */
export async function getMarkdownFlavors(): Promise<string[]> {
  return invoke('get_markdown_flavors');
}

/**
 * Helper to check if a flavor is supported
 */
export function isValidFlavor(flavor: string): flavor is MarkdownFlavor {
  return flavor === 'commonmark' || flavor === 'gfm';
}

/**
 * Get display name for a markdown flavor
 */
export function getFlavorDisplayName(flavor: MarkdownFlavor): string {
  return flavor === 'commonmark' ? 'CommonMark' : 'GitHub Flavored Markdown';
}
