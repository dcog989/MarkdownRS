/**
 * Markdown Formatter
 * Applies consistent formatting to markdown content
 */

export interface FormatterOptions {
    listIndent: number; // Spaces for list indentation
    codeBlockFence: '```' | '~~~'; // Preferred code fence
    bulletChar: '-' | '*' | '+'; // Bullet list character
    emphasisChar: '*' | '_'; // Emphasis character
    strongEmphasisChar: '**' | '__'; // Strong emphasis character
    headingStyle: 'atx' | 'setext'; // # Heading vs Underline
    linkStyle: 'inline' | 'reference'; // [text](url) vs [text][ref]
    tableAlignment: boolean; // Align table columns
}

const DEFAULT_OPTIONS: FormatterOptions = {
    listIndent: 2,
    codeBlockFence: '```',
    bulletChar: '-',
    emphasisChar: '*',
    strongEmphasisChar: '**',
    headingStyle: 'atx',
    linkStyle: 'inline',
    tableAlignment: true,
};

export class MarkdownFormatter {
    private options: FormatterOptions;

    constructor(options?: Partial<FormatterOptions>) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Format markdown content
     */
    format(content: string): string {
        let formatted = content;

        // Normalize line endings
        formatted = formatted.replace(/\r\n/g, '\n');

        // Remove trailing whitespace from lines
        formatted = formatted
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n');

        // Ensure single blank line between blocks
        formatted = formatted.replace(/\n{3,}/g, '\n\n');

        // Format headings
        formatted = this.formatHeadings(formatted);

        // Format lists
        formatted = this.formatLists(formatted);

        // Format code blocks
        formatted = this.formatCodeBlocks(formatted);

        // Format tables
        if (this.options.tableAlignment) {
            formatted = this.formatTables(formatted);
        }

        // Ensure file ends with single newline
        formatted = formatted.trimEnd() + '\n';

        return formatted;
    }

    /**
     * Format ATX-style headings (# Heading)
     */
    private formatHeadings(content: string): string {
        if (this.options.headingStyle !== 'atx') return content;

        return content
            .split('\n')
            .map(line => {
                // Match heading lines
                const match = line.match(/^(#{1,6})\s*(.+?)(\s*#+)?$/);
                if (match) {
                    const level = match[1];
                    const text = match[2].trim();
                    // Consistent format: level + space + text (no trailing #)
                    return `${level} ${text}`;
                }
                return line;
            })
            .join('\n');
    }

    /**
     * Format list indentation
     */
    private formatLists(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let inList = false;
        let listLevel = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detect list items
            const bulletMatch = trimmed.match(/^[-*+]\s+/);
            const orderedMatch = trimmed.match(/^\d+\.\s+/);

            if (bulletMatch || orderedMatch) {
                // Calculate indentation level
                const leadingSpaces = line.length - line.trimLeft().length;
                listLevel = Math.floor(leadingSpaces / this.options.listIndent);
                inList = true;

                // Normalize bullet character
                const indent = ' '.repeat(listLevel * this.options.listIndent);
                if (bulletMatch) {
                    const content = trimmed.substring(bulletMatch[0].length);
                    result.push(`${indent}${this.options.bulletChar} ${content}`);
                } else if (orderedMatch) {
                    const content = trimmed.substring(orderedMatch[0].length);
                    const number = orderedMatch[0].trim().replace('.', '');
                    result.push(`${indent}${number}. ${content}`);
                }
            } else if (trimmed === '') {
                result.push('');
                inList = false;
                listLevel = 0;
            } else if (inList && line.startsWith(' ')) {
                // Continuation of list item (indented content)
                const indent = ' '.repeat((listLevel + 1) * this.options.listIndent);
                result.push(`${indent}${trimmed}`);
            } else {
                result.push(line);
                inList = false;
                listLevel = 0;
            }
        }

        return result.join('\n');
    }

    /**
     * Normalize code block fences
     */
    private formatCodeBlocks(content: string): string {
        const preferredFence = this.options.codeBlockFence;

        return content.replace(
            /^(```|~~~)(\w*)\n([\s\S]*?)^(```|~~~)/gm,
            (_, _openFence, lang, code, _closeFence) => {
                return `${preferredFence}${lang}\n${code}${preferredFence}`;
            }
        );
    }

    /**
     * Align table columns
     */
    private formatTables(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];
        let inTable = false;
        let tableLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detect table rows
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                inTable = true;
                tableLines.push(trimmed);
            } else if (inTable) {
                // End of table - format and add
                result.push(...this.alignTable(tableLines));
                tableLines = [];
                inTable = false;
                result.push(line);
            } else {
                result.push(line);
            }
        }

        // Handle table at end of file
        if (tableLines.length > 0) {
            result.push(...this.alignTable(tableLines));
        }

        return result.join('\n');
    }

    /**
     * Align a table's columns
     */
    private alignTable(tableLines: string[]): string[] {
        if (tableLines.length < 2) return tableLines;

        // Parse cells
        const rows = tableLines.map(line =>
            line
                .split('|')
                .slice(1, -1)
                .map(cell => cell.trim())
        );

        // Calculate max width for each column
        const columnWidths: number[] = [];
        for (const row of rows) {
            row.forEach((cell, col) => {
                columnWidths[col] = Math.max(columnWidths[col] || 0, cell.length);
            });
        }

        // Format rows
        return rows.map((row, rowIndex) => {
            const cells = row.map((cell, colIndex) => {
                const width = columnWidths[colIndex];
                if (rowIndex === 1 && cell.match(/^:?-+:?$/)) {
                    // Separator row - preserve alignment markers
                    const leftAlign = cell.startsWith(':');
                    const rightAlign = cell.endsWith(':');
                    const dashes = '-'.repeat(width);
                    if (leftAlign && rightAlign) return `:${dashes}:`;
                    if (leftAlign) return `:${dashes}`;
                    if (rightAlign) return `${dashes}:`;
                    return dashes;
                }
                return cell.padEnd(width, ' ');
            });
            return `| ${cells.join(' | ')} |`;
        });
    }
}

// Default formatter instance
export const defaultFormatter = new MarkdownFormatter();

/**
 * Quick format function
 */
export function formatMarkdown(content: string, options?: Partial<FormatterOptions>): string {
    const formatter = options
        ? new MarkdownFormatter(options)
        : defaultFormatter;

    return formatter.format(content);
}
