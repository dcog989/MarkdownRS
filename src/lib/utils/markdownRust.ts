import { error } from '@tauri-apps/plugin-log';
import DOMPurify from 'dompurify';
import { callBackend } from './backend';

export interface RenderResult {
    html: string;
    line_map: Record<number, number>;
}

/**
 * Detects and wraps file paths in clickable links
 */
function linkifyFilePaths(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const pathRegex = /(?:^|\s)([A-Za-z]:[\\\/.][^\s<>"'|?*]*|(?:\.{0,2}\/|~\/)[^\s<>"'|?*]+)/g;

    const walker = document.createTreeWalker(
        temp,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'A' || parent.tagName === 'CODE' || parent.tagName === 'PRE')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToReplace: { node: Node; newContent: DocumentFragment }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        const matches = [...text.matchAll(pathRegex)];

        if (matches.length > 0) {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            for (const match of matches) {
                const fullMatch = match[0];
                const path = match[1];
                const index = match.index || 0;

                if (index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
                }

                const leadingSpace = fullMatch.match(/^\s+/);
                if (leadingSpace) {
                    fragment.appendChild(document.createTextNode(leadingSpace[0]));
                }

                const link = document.createElement('a');
                link.href = path;
                link.textContent = path;
                link.className = 'file-path-link';
                link.style.cssText = 'color: var(--color-accent-link); text-decoration: underline; cursor: pointer;';
                fragment.appendChild(link);

                lastIndex = index + fullMatch.length;
            }

            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }

            nodesToReplace.push({ node, newContent: fragment });
        }
    }

    for (const { node, newContent } of nodesToReplace) {
        node.parentNode?.replaceChild(newContent, node);
    }

    return temp.innerHTML;
}

/**
 * Renders markdown using the Rust backend
 */
export async function renderMarkdown(content: string, gfm: boolean = true): Promise<string> {
    try {
        const result = await callBackend<RenderResult>('render_markdown_content', {
            content,
            gfm
        }, 'Markdown:Render');

        const cleanHtml = DOMPurify.sanitize(result.html, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target', 'class', 'data-source-line', 'align', 'start', 'type', 'disabled', 'checked']
        });

        const linkedHtml = linkifyFilePaths(cleanHtml);

        return linkedHtml;
    } catch (e) {
        await error(`[Markdown] Render error: ${e}`);
        return `<div style="color: #ff6b6b; padding: 1rem; border: 1px solid #ff6b6b;">
            <strong>Preview Error:</strong><br/>${String(e)}
        </div>`;
    }
}
