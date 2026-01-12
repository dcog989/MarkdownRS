// TypeScript interfaces and functions for comrak-based markdown commands

import type { FormatterOptions, MarkdownFlavor, RenderResult } from '$lib/types/markdown';
import { callBackend } from './backend';
import { CONFIG } from './config';
import { IncrementalMarkdownRenderer } from './incrementalMarkdown.svelte';
import { countWords } from './textMetrics';

// Global incremental renderer instance (one per document)
const rendererCache = new Map<string, IncrementalMarkdownRenderer>();

/**
 * Get or create an incremental renderer for a document
 */
function getRenderer(documentId: string): IncrementalMarkdownRenderer {
    if (!rendererCache.has(documentId)) {
        rendererCache.set(documentId, new IncrementalMarkdownRenderer());
    }
    return rendererCache.get(documentId)!;
}

/**
 * Clear renderer cache for a document
 */
export function clearRendererCache(documentId: string): void {
    const renderer = rendererCache.get(documentId);
    if (renderer) {
        renderer.clear();
        rendererCache.delete(documentId);
    }
}

/**
 * Clear all renderer caches
 */
export function clearAllRendererCaches(): void {
    rendererCache.forEach((renderer) => renderer.clear());
    rendererCache.clear();
}

/**
 * Render markdown using the comrak engine with incremental rendering
 *
 * @param content - The markdown content to render
 * @param flavor - Markdown flavor ('commonmark' or 'gfm'), defaults to 'gfm'
 * @param documentId - Optional document identifier for caching (defaults to 'default')
 * @returns Rendered HTML with line mapping for scroll sync
 */
export async function renderMarkdown(
    content: string,
    flavor?: MarkdownFlavor,
    documentId: string = 'default',
): Promise<RenderResult> {
    const gfm = !flavor || flavor === 'gfm';
    const renderer = getRenderer(documentId);
    const html = await renderer.render(content, gfm);

    let wordCount = 0;
    let charCount = 0;

    if (content.length > CONFIG.PERFORMANCE.LARGE_FILE_SIZE_BYTES) {
        // Offload large file word counting to Rust to avoid UI jank
        const result = await callBackend('compute_text_metrics', { content }, 'Markdown:Render');
        if (result) {
            wordCount = result[1];
            charCount = result[2];
        }
    } else {
        wordCount = countWords(content);
        charCount = content.length;
    }

    return {
        html,
        line_map: {},
        word_count: wordCount,
        char_count: charCount,
    };
}

/**
 * Format markdown using the comrak engine
 *
 * @param content - The markdown content to format
 * @param options - Formatting options
 * @returns Formatted markdown string
 */
export async function formatMarkdown(content: string, options?: FormatterOptions): Promise<string> {
    const result = await callBackend(
        'format_markdown',
        {
            content,
            flavor: options?.flavor,
            listIndent: options?.list_indent,
            bulletChar: options?.bullet_char,
            codeBlockFence: options?.code_block_fence,
            tableAlignment: options?.table_alignment,
        },
        'Markdown:Render',
    );

    if (result === null) {
        throw new Error('Markdown formatting failed: null result');
    }

    return result;
}

/**
 * Get list of supported markdown flavors
 *
 * @returns Array of flavor names
 */
export async function getMarkdownFlavors(): Promise<string[]> {
    const result = await callBackend('get_markdown_flavors', {}, 'Markdown:Render');

    if (result === null) {
        return [];
    }

    return result;
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
