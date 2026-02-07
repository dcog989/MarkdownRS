import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { SvelteMap } from 'svelte/reactivity';
import { callBackend } from './backend';
import { CONFIG } from './config';

interface MarkdownBlock {
    startLine: number;
    endLine: number;
    content: string;
    hash: string;
}

/**
 * Incremental markdown renderer
 * Uses semantic splitting and caching to minimize re-renders.
 */
export class IncrementalMarkdownRenderer {
    private htmlCache = new SvelteMap<string, string>();

    /**
     * Render markdown with incremental updates
     */
    async render(content: string, gfm: boolean = true): Promise<string> {
        // For small documents, use full rendering (faster for small files)
        if (content.length < CONFIG.PERFORMANCE.INCREMENTAL_RENDER_MIN_SIZE) {
            return this.renderFull(content, gfm);
        }

        try {
            const blocks = this.splitIntoBlocks(content);
            const flavor = gfm ? 'gfm' : 'commonmark';

            // Process blocks (render missing ones in parallel)
            const renderedSegments = await Promise.all(
                blocks.map(async (block) => {
                    // Check cache
                    let baseHtml = this.htmlCache.get(block.hash);

                    if (!baseHtml) {
                        const result = await callBackend(
                            'render_markdown',
                            {
                                content: block.content,
                                flavor,
                            },
                            'Markdown:Render',
                        );

                        if (!result) {
                            throw new Error('Markdown rendering failed: null result');
                        }

                        baseHtml = DOMPurify.sanitize(result.html, {
                            USE_PROFILES: { html: true },
                            ADD_ATTR: [
                                'target',
                                'class',
                                'data-source-line',
                                'align',
                                'start',
                                'type',
                                'disabled',
                                'checked',
                            ],
                        });

                        // Prevent memory leak: Evict oldest entry if limit reached
                        if (this.htmlCache.size >= CONFIG.PERFORMANCE.INCREMENTAL_CACHE_LIMIT) {
                            const oldestKey = this.htmlCache.keys().next().value;
                            if (oldestKey !== undefined) {
                                this.htmlCache.delete(oldestKey);
                            }
                        }

                        this.htmlCache.set(block.hash, baseHtml);
                    } else {
                        // Refresh position in Map for LRU behavior
                        this.htmlCache.delete(block.hash);
                        this.htmlCache.set(block.hash, baseHtml);
                    }

                    // Adjust line numbers for this segment's position in the full doc
                    return this.adjustLineNumbers(baseHtml, block.startLine);
                }),
            );

            return renderedSegments.join('\n');
        } catch (e) {
            await error(`[Markdown] Incremental render error: ${e}`);
            return this.renderFull(content, gfm); // Fallback
        }
    }

    /**
     * Full document render (fallback or small files)
     */
    private async renderFull(content: string, gfm: boolean): Promise<string> {
        try {
            const flavor = gfm ? 'gfm' : 'commonmark';
            const result = await callBackend(
                'render_markdown',
                {
                    content,
                    flavor,
                },
                'Markdown:Render',
            );

            if (!result) {
                throw new Error('Markdown rendering failed: null result');
            }

            return DOMPurify.sanitize(result.html, {
                USE_PROFILES: { html: true },
                ADD_ATTR: [
                    'target',
                    'class',
                    'data-source-line',
                    'align',
                    'start',
                    'type',
                    'disabled',
                    'checked',
                ],
            });
        } catch (e) {
            await error(`[Markdown] Render error: ${e}`);
            return `<div class="preview-error">
            <strong>Preview Error:</strong><br/>${String(e)}
        </div>`;
        }
    }

    /**
     * Split content into semantic blocks to preserve cache validity during edits.
     * Uses a scanner pattern (indexOf) to avoid massive array allocations from .split('\n').
     */
    private splitIntoBlocks(content: string): MarkdownBlock[] {
        const blocks: MarkdownBlock[] = [];
        let currentStartLine = 0;
        let lineIndex = 0;
        let lastLinePos = 0;
        let blockStartPos = 0;
        let lineCountInBlock = 0;
        let inFence = false;

        const fenceRegex = /^(\s{0,3})(`{3,}|~{3,})/;
        const headerRegex = /^#{1,6}\s/;
        const hrRegex = /^(\s{0,3})([-*_])\s*(\2\s*){2,}$/;

        let nextLinePos = content.indexOf('\n', 0);

        while (lineIndex <= content.length) {
            const endOfLine = nextLinePos === -1 ? content.length : nextLinePos;
            const line = content.substring(lastLinePos, endOfLine);

            if (fenceRegex.test(line)) inFence = !inFence;

            let shouldSplit = false;
            if (!inFence && lineCountInBlock > 0) {
                if (headerRegex.test(line) || hrRegex.test(line)) {
                    shouldSplit = true;
                } else if (lineCountInBlock > 20 && line.trim() === '') {
                    // Check if next line is text (paragraph break)
                    const nextLineStart = endOfLine + 1;
                    if (nextLineStart < content.length) {
                        const afterBreak = content.indexOf('\n', nextLineStart);
                        const nextLine = content.substring(
                            nextLineStart,
                            afterBreak === -1 ? content.length : afterBreak,
                        );
                        if (nextLine.trim() !== '') shouldSplit = true;
                    }
                }
            }

            if (lineCountInBlock >= CONFIG.PERFORMANCE.INCREMENTAL_BLOCK_SIZE_LIMIT && !inFence) {
                shouldSplit = true;
            }

            if (shouldSplit) {
                const blockContent = content.substring(blockStartPos, lastLinePos);
                blocks.push({
                    startLine: currentStartLine,
                    endLine: lineIndex,
                    content: blockContent.endsWith('\n') ? blockContent.slice(0, -1) : blockContent,
                    hash: this.hashString(blockContent),
                });
                blockStartPos = lastLinePos;
                currentStartLine = lineIndex;
                lineCountInBlock = 0;
            }

            lineCountInBlock++;
            lineIndex++;

            if (nextLinePos === -1) break;
            lastLinePos = nextLinePos + 1;
            nextLinePos = content.indexOf('\n', lastLinePos);
        }

        // Add remaining content as final block (if any content was processed)
        if (blocks.length === 0) {
            blocks.push({
                startLine: currentStartLine,
                endLine: lineIndex,
                content: content,
                hash: this.hashString(content),
            });
        }

        return blocks;
    }

    /**
     * Offset line numbers in HTML to match document position
     */
    private adjustLineNumbers(html: string, offset: number): string {
        if (offset === 0) return html;

        // Use a DOM parser to safely target attributes without affecting text content
        // This avoids issues where code blocks might contain the string "data-source-line"
        const template = document.createElement('template');
        template.innerHTML = html;

        const elements = template.content.querySelectorAll('[data-source-line]');

        for (const el of elements) {
            const val = el.getAttribute('data-source-line');
            if (val) {
                const newLine = parseInt(val, 10) + offset;
                el.setAttribute('data-source-line', newLine.toString());
            }
        }

        // Use XMLSerializer for more robust HTML serialization than innerHTML
        const serializer = new XMLSerializer();
        return serializer.serializeToString(template.content);
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    clear(): void {
        this.htmlCache.clear();
    }

    getStats(): { blocks: number; cacheSize: number } {
        return {
            blocks: 0,
            cacheSize: this.htmlCache.size,
        };
    }
}
