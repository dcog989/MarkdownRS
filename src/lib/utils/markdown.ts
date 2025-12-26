// TypeScript interfaces and functions for comrak-based markdown commands

import type { FormatterOptions, MarkdownFlavor, RenderResult } from '$lib/types/markdown';
import { invoke } from '@tauri-apps/api/core';
import { IncrementalMarkdownRenderer } from './incrementalMarkdown.svelte';

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
  rendererCache.forEach(renderer => renderer.clear());
  rendererCache.clear();
}

/**
 * Render markdown using the comrak engine with incremental rendering
 *
 * @param content - The markdown content to render
 * @param flavor - Markdown flavor ('commonmark' or 'gfm'), defaults to 'gfm'
 * @param documentId - Optional document identifier for caching (defaults to 'default')
 * @returns Rendered HTML with line mapping for scroll sync
 *
 * @example
 * ```typescript
 * const result = await renderMarkdown('# Hello\n\nWorld', 'gfm', 'doc-123');
 * console.log(result.html); // <h1>Hello</h1><p>World</p>
 * ```
 */
export async function renderMarkdown(
  content: string,
  flavor?: MarkdownFlavor,
  documentId: string = 'default'
): Promise<RenderResult> {
  const gfm = !flavor || flavor === 'gfm';
  const renderer = getRenderer(documentId);
  const html = await renderer.render(content, gfm);

  // Return with empty line_map for now (incremental rendering makes this complex)
  // The line mapping is less critical than performance for large files
  return { html, line_map: {} };
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
