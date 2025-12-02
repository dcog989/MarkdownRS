import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Configure marked to be secure and standard-compliant
marked.use({
    gfm: true,
    breaks: true
});

export async function renderMarkdown(content: string): Promise<string> {
    // Parse markdown to HTML
    const rawHtml = await marked.parse(content);

    // Sanitize the HTML to prevent XSS
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        // Allow specific attributes for syntax highlighting if needed later
        ADD_ATTR: ['target', 'class']
    });

    return cleanHtml;
}
