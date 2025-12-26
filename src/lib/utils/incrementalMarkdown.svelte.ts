import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { callBackend } from './backend';

interface MarkdownBlock {
    startLine: number;
    endLine: number;
    content: string;
    html: string;
    hash: string;
}

interface RenderResult {
    html: string;
    line_map: Record<number, number>;
}

/**
 * Incremental markdown renderer that only re-renders changed blocks
 * to improve performance for large documents
 */
export class IncrementalMarkdownRenderer {
    private blocks: MarkdownBlock[] = [];
    private lastContent: string = '';
    private readonly BLOCK_SIZE = 100; // Lines per block
    private readonly MIN_SIZE_FOR_INCREMENTAL = 5000; // Characters

    /**
     * Render markdown with incremental updates
     */
    async render(content: string, gfm: boolean = true): Promise<string> {
        // For small documents, use full rendering (faster for small files)
        if (content.length < this.MIN_SIZE_FOR_INCREMENTAL) {
            return this.renderFull(content, gfm);
        }

        // Detect changes and render incrementally
        const changedBlocks = this.detectChanges(content);
        
        if (changedBlocks.length === 0 && this.blocks.length > 0) {
            // No changes, return cached HTML
            return this.assembleHtml();
        }

        // If too many blocks changed (>50%), do full render
        const totalBlocks = Math.ceil(content.split('\n').length / this.BLOCK_SIZE);
        if (changedBlocks.length > totalBlocks * 0.5 || this.blocks.length === 0) {
            return this.renderFull(content, gfm);
        }

        // Render only changed blocks
        await this.renderBlocks(changedBlocks, gfm);
        this.lastContent = content;
        
        return this.assembleHtml();
    }

    /**
     * Full document render (for small files or major changes)
     */
    private async renderFull(content: string, gfm: boolean): Promise<string> {
        try {
            const flavor = gfm ? 'gfm' : 'commonmark';
            const result = await callBackend<RenderResult>('render_markdown', {
                content,
                flavor
            }, 'Markdown:Render');

            const cleanHtml = DOMPurify.sanitize(result.html, {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
            });

            // Update block cache for future incremental updates
            this.updateBlockCache(content, cleanHtml);
            this.lastContent = content;

            return cleanHtml;
        } catch (e) {
            await error(`[Markdown] Render error: ${e}`);
            return this.getErrorHtml(String(e));
        }
    }

    /**
     * Detect which blocks have changed
     */
    private detectChanges(content: string): MarkdownBlock[] {
        const lines = content.split('\n');
        const changedBlocks: MarkdownBlock[] = [];
        const blockCount = Math.ceil(lines.length / this.BLOCK_SIZE);

        for (let i = 0; i < blockCount; i++) {
            const startLine = i * this.BLOCK_SIZE;
            const endLine = Math.min((i + 1) * this.BLOCK_SIZE, lines.length);
            const blockContent = lines.slice(startLine, endLine).join('\n');
            const hash = this.hashString(blockContent);

            const existingBlock = this.blocks[i];
            if (!existingBlock || existingBlock.hash !== hash) {
                changedBlocks.push({
                    startLine,
                    endLine,
                    content: blockContent,
                    html: '',
                    hash
                });
            }
        }

        return changedBlocks;
    }

    /**
     * Render specific blocks
     */
    private async renderBlocks(blocks: MarkdownBlock[], gfm: boolean): Promise<void> {
        const flavor = gfm ? 'gfm' : 'commonmark';

        try {
            // Render blocks in parallel for better performance
            const renderPromises = blocks.map(async (block) => {
                const result = await callBackend<RenderResult>('render_markdown', {
                    content: block.content,
                    flavor
                }, 'Markdown:Render');

                block.html = DOMPurify.sanitize(result.html, {
                    USE_PROFILES: { html: true },
                    ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
                });

                return block;
            });

            const renderedBlocks = await Promise.all(renderPromises);

            // Update block cache
            renderedBlocks.forEach(block => {
                const blockIndex = Math.floor(block.startLine / this.BLOCK_SIZE);
                this.blocks[blockIndex] = block;
            });
        } catch (e) {
            await error(`[Markdown] Block render error: ${e}`);
            throw e;
        }
    }

    /**
     * Update block cache after full render
     */
    private updateBlockCache(content: string, html: string): void {
        const lines = content.split('\n');
        const htmlLines = html.split('\n');
        const blockCount = Math.ceil(lines.length / this.BLOCK_SIZE);

        this.blocks = [];

        for (let i = 0; i < blockCount; i++) {
            const startLine = i * this.BLOCK_SIZE;
            const endLine = Math.min((i + 1) * this.BLOCK_SIZE, lines.length);
            const blockContent = lines.slice(startLine, endLine).join('\n');
            
            // Approximate HTML mapping (simplified)
            const htmlStartLine = Math.floor((startLine / lines.length) * htmlLines.length);
            const htmlEndLine = Math.floor((endLine / lines.length) * htmlLines.length);
            const blockHtml = htmlLines.slice(htmlStartLine, htmlEndLine).join('\n');

            this.blocks.push({
                startLine,
                endLine,
                content: blockContent,
                html: blockHtml,
                hash: this.hashString(blockContent)
            });
        }
    }

    /**
     * Assemble HTML from cached blocks
     */
    private assembleHtml(): string {
        return this.blocks.map(block => block.html).join('\n');
    }

    /**
     * Simple string hash function
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Get error HTML
     */
    private getErrorHtml(message: string): string {
        return `<div style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b;">
            <strong>Preview Error:</strong><br/>${message}
        </div>`;
    }

    /**
     * Clear cache (useful when switching documents)
     */
    clear(): void {
        this.blocks = [];
        this.lastContent = '';
    }

    /**
     * Get cache statistics for debugging
     */
    getStats(): { blocks: number; totalSize: number } {
        return {
            blocks: this.blocks.length,
            totalSize: this.blocks.reduce((sum, b) => sum + b.content.length, 0)
        };
    }
}
