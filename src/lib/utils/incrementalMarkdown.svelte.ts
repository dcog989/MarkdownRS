import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
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
    private htmlCache = new Map<string, string>();

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
                        const result = await callBackend('render_markdown', {
                            content: block.content,
                            flavor
                        }, 'Markdown:Render');

                        if (!result) {
                            throw new Error('Markdown rendering failed: null result');
                        }

                        baseHtml = DOMPurify.sanitize(result.html, {
                            USE_PROFILES: { html: true },
                            ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
                        });

                        this.htmlCache.set(block.hash, baseHtml);
                    }

                    // Adjust line numbers for this segment's position in the full doc
                    return this.adjustLineNumbers(baseHtml, block.startLine);
                })
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
            const result = await callBackend('render_markdown', {
                content,
                flavor
            }, 'Markdown:Render');

            if (!result) {
                throw new Error('Markdown rendering failed: null result');
            }

            return DOMPurify.sanitize(result.html, {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
            });
        } catch (e) {
            await error(`[Markdown] Render error: ${e}`);
            return `<div style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b;">
            <strong>Preview Error:</strong><br/>${String(e)}
        </div>`;
        }
    }

    /**
     * Split content into semantic blocks to preserve cache validity during edits.
     * Splits on headers, horizontal rules, and large gaps, while respecting code fences.
     */
    private splitIntoBlocks(content: string): MarkdownBlock[] {
        const lines = content.split('\n');
        const blocks: MarkdownBlock[] = [];
        let currentLines: string[] = [];
        let currentStartLine = 0;
        let inFence = false;

        // Regex patterns
        const fenceRegex = /^(\s{0,3})(`{3,}|~{3,})/;
        const headerRegex = /^#{1,6}\s/;
        const hrRegex = /^(\s{0,3})([-*_])\s*(\2\s*){2,}$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for fence toggle
            if (fenceRegex.test(line)) {
                inFence = !inFence;
            }

            let shouldSplit = false;

            // Semantic splitting logic
            if (!inFence && currentLines.length > 0) {
                // Always split before a header (starts a new section)
                if (headerRegex.test(line)) {
                    shouldSplit = true;
                }
                // Split before a horizontal rule
                else if (hrRegex.test(line)) {
                    shouldSplit = true;
                }
                // Split if we have a blank line followed by text (paragraph break)
                // Only if current block is getting large (> 20 lines) to avoid fragmentation
                else if (currentLines.length > 20 && line.trim() === '' && i + 1 < lines.length && lines[i + 1].trim() !== '') {
                    shouldSplit = true;
                }
            }

            // Safety: Force split if block gets too large to keep UI responsive
            if (currentLines.length >= CONFIG.PERFORMANCE.INCREMENTAL_BLOCK_SIZE_LIMIT && !inFence) {
                shouldSplit = true;
            }

            if (shouldSplit) {
                const blockContent = currentLines.join('\n');
                blocks.push({
                    startLine: currentStartLine,
                    endLine: i,
                    content: blockContent,
                    hash: this.hashString(blockContent)
                });
                currentLines = [];
                currentStartLine = i;
            }

            currentLines.push(line);
        }

        // Add remaining lines
        if (currentLines.length > 0) {
            const blockContent = currentLines.join('\n');
            blocks.push({
                startLine: currentStartLine,
                endLine: lines.length,
                content: blockContent,
                hash: this.hashString(blockContent)
            });
        }

        return blocks;
    }

    /**
     * Offset line numbers in HTML to match document position
     */
    private adjustLineNumbers(html: string, offset: number): string {
        if (offset === 0) return html;
        // Regex finds data-source-line="123" and adds offset
        return html.replace(/data-source-line="(\d+)"/g, (_, line) => {
            return `data-source-line="${parseInt(line, 10) + offset}"`;
        });
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
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
            cacheSize: this.htmlCache.size
        };
    }
}
