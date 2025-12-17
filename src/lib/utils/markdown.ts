import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Configure DOMPurify to allow the data-source-line attribute
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('data-source-line')) {
        // Attribute is preserved
    }
});

// Define extensions to override standard renderers and access the token directly
// Explicitly type 'this' to avoid implicit 'any' errors
const rendererExtensions = [
    {
        name: 'heading',
        renderer(this: any, token: any) {
            const text = this.parser.parseInline(token.tokens);
            return `<h${token.depth} data-source-line="${token._line || ''}">${text}</h${token.depth}>\n`;
        }
    },
    {
        name: 'paragraph',
        renderer(this: any, token: any) {
            const text = this.parser.parseInline(token.tokens);
            return `<p data-source-line="${token._line || ''}">${text}</p>\n`;
        }
    },
    {
        name: 'code',
        renderer(this: any, token: any) {
            const lang = (token.lang || '').split(/\s+/)[0];
            const code = token.text;
            return `<pre data-source-line="${token._line || ''}"><code class="language-${lang}">${code}</code></pre>\n`;
        }
    },
    {
        name: 'blockquote',
        renderer(this: any, token: any) {
            const body = this.parser.parse(token.tokens);
            return `<blockquote data-source-line="${token._line || ''}">\n${body}</blockquote>\n`;
        }
    },
    {
        name: 'list',
        renderer(this: any, token: any) {
            const body = this.parser.parse(token.items);
            const tag = token.ordered ? 'ol' : 'ul';
            const start = token.start && token.start !== 1 ? ` start="${token.start}"` : '';
            return `<${tag}${start} data-source-line="${token._line || ''}">\n${body}</${tag}>\n`;
        }
    },
    {
        name: 'list_item',
        renderer(this: any, token: any) {
            const body = this.parser.parse(token.tokens);
            let checkbox = '';
            if (token.task) {
                checkbox = `<input type="checkbox" disabled ${token.checked ? 'checked' : ''}> `;
            }
            return `<li data-source-line="${token._line || ''}">${checkbox}${body}</li>\n`;
        }
    },
    {
        name: 'table',
        renderer(this: any, token: any) {
            let header = '';
            let cell = '';
            for (let j = 0; j < token.header.length; j++) {
                cell += `<th align="${token.align[j] || 'center'}">${this.parser.parseInline(token.header[j].tokens)}</th>`;
            }
            header += `<tr>${cell}</tr>`;

            let body = '';
            for (let i = 0; i < token.rows.length; i++) {
                const row = token.rows[i];
                cell = '';
                for (let j = 0; j < row.length; j++) {
                    cell += `<td align="${token.align[j] || 'center'}">${this.parser.parseInline(row[j].tokens)}</td>`;
                }
                body += `<tr>${cell}</tr>`;
            }

            return `<table data-source-line="${token._line || ''}">\n<thead>\n${header}</thead>\n<tbody>\n${body}</tbody>\n</table>\n`;
        }
    }
];

// Configure marked globally
marked.use({
    gfm: true,
    breaks: true,
    extensions: rendererExtensions as any
});

/**
 * Custom renderer that injects source line numbers.
 */
export async function renderMarkdown(content: string): Promise<string> {
    try {
        // 1. Tokenize
        const tokens = marked.lexer(content);

        // 2. Map tokens to line numbers
        let currentOffset = 0;

        function addLineNumbers(tokens: any[]) {
            tokens.forEach(token => {
                if (token.raw) {
                    const index = content.indexOf(token.raw, currentOffset);
                    if (index !== -1) {
                        currentOffset = index;
                        const linesBefore = content.substring(0, index).split('\n').length;
                        token._line = linesBefore;
                    }
                }

                if (token.tokens) addLineNumbers(token.tokens);
                if (token.items) addLineNumbers(token.items);
            });
        }

        addLineNumbers(tokens);

        // Ensure line numbers propagate to children if missing
        function passLineToChildren(tokens: any[], parentLine: number) {
            tokens.forEach(t => {
                t._line = t._line || parentLine;
                if (t.tokens) passLineToChildren(t.tokens, t._line);
                if (t.items) passLineToChildren(t.items, t._line);
            });
        }
        passLineToChildren(tokens, 1);

        // 3. Parse using the globally registered extensions
        const rawHtml = marked.parser(tokens);

        // 4. Sanitize
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start']
        });

        return cleanHtml;
    } catch (e) {
        await error(`[Markdown] Render error: ${e}`);
        // Return a safe error message to the preview
        return `<div style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b;">
            <strong>Preview Error:</strong><br/>${String(e)}
        </div>`;
    }
}
