import { callBackend } from "./backend";

const DEFAULT_DARK_CSS = `/* MarkdownRS Default Dark Theme */

/* --- EDITOR CONTENT --- */
.cm-editor .cm-content {
    caret-color: #d58dff;
}
.cm-editor .cm-gutters {
    background-color: var(--color-bg-main) !important;
    border-right: 1px solid var(--color-border-main) !important;
}
.cm-editor .cm-gutterElement {
    color: #515151 !important;
    display: flex !important;
    align-items: center;
    justify-content: flex-end;
    padding: 0 8px !important;
}
.cm-editor .cm-activeLineGutter {
    background-color: var(--color-bg-panel) !important;
    color: var(--color-fg-muted) !important;
    font-weight: bold;
}
.cm-editor {
    background-color: var(--color-bg-main);
    color: var(--color-fg-default);
}
.cm-editor .cm-activeLine {
    background-color: rgba(255, 255, 255, 0.08) !important;
}

/* Text selection */
.cm-editor.cm-focused .cm-selectionBackground,
.cm-editor .cm-selectionBackground,
.cm-editor .cm-content ::selection {
    background-color: rgba(187, 112, 228, 0.35) !important;
}
.cm-editor .cm-selectionMatch {
    background-color: rgba(209, 154, 102, 0.35);
}

.cm-h1,
.cm-h2,
.cm-h3,
.cm-h4,
.cm-h5,
.cm-h6 {
    color: #e06c75;
    font-weight: bold;
}
.cm-h1 { font-size: 1.3em; }
.cm-h2 { font-size: 1.2em; }
.cm-h3 { font-size: 1.1em; }
.cm-keyword { color: #c678dd; }
.cm-atom { color: #d19a66; }
.cm-number { color: #d19a66; }
.cm-string { color: #98c379; }
.cm-comment { color: #7f848e; font-style: italic; }

.cm-link { color: var(--color-accent-link); text-decoration: underline; }
.cm-url { color: var(--color-accent-url); text-decoration: underline; }
.cm-file-path { color: var(--color-accent-filepath); text-decoration: underline; }

.cm-emphasis { font-style: italic; }
.cm-strong { font-weight: bold; }

/* Markdown Elements */
.cm-highlight {
    background-color: var(--color-bg-highlight);
    color: #000;
}
.cm-strikethrough {
    text-decoration: line-through;
    opacity: 0.8;
}
.cm-code {
    background-color: var(--color-bg-code);
    color: var(--color-fg-code);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}
.cm-codeMark {
    background-color: transparent !important;
    color: #abb2bf !important;
    padding: 0 !important;
    border-radius: 0 !important;
    font-family: inherit !important;
}
/* Removed border/bg from base class to prevent duplication. Handled by app.css via plugins */
.cm-blockquote {
    color: var(--color-fg-muted);
    font-style: italic;
}

/* --- PREVIEW CONTENT --- */
.prose {
    --tw-prose-body: #abb2bf;
    --tw-prose-headings: #e06c75;
    --tw-prose-links: #61afef;
    --tw-prose-code: #82e57b;
    --tw-prose-quotes: #7f848e;
}
.prose blockquote {
    border-left: 4px solid rgb(221, 206, 120);
    background: rgb(221, 206, 120, 0.18);
    border-radius: 4px;
}
.prose code {
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
    font-weight: normal;
}
.prose h1, .prose h2, .prose h3, .prose h4 {
    font-family: Georgia, "Times New Roman", Times, serif;
}
.prose h1 {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.3em;
}
.prose pre {
    background: #333;
    color: #89e57b;
}
`;

const DEFAULT_LIGHT_CSS = `/* MarkdownRS Default Light Theme */

/* --- EDITOR CONTENT --- */
.cm-editor .cm-content {
    caret-color: #212121;
}
.cm-editor .cm-gutters {
    background-color: var(--color-bg-main) !important;
    border-right: 1px solid var(--color-border-main) !important;
}
.cm-editor .cm-gutterElement {
    color: #9ca3af !important;
    display: flex !important;
    align-items: center;
    justify-content: flex-end;
    padding: 0 8px !important;
}
.cm-editor .cm-activeLineGutter {
    background-color: var(--color-bg-panel) !important;
    color: var(--color-fg-default) !important;
    font-weight: bold;
}
.cm-editor {
    background-color: var(--color-bg-main);
    color: var(--color-fg-default);
}
.cm-editor .cm-activeLine {
    background-color: rgba(0, 0, 0, 0.03) !important;
}

/* Text selection */
.cm-editor.cm-focused .cm-selectionBackground,
.cm-editor .cm-selectionBackground,
.cm-editor .cm-content ::selection {
    background-color: rgba(25, 118, 210, 0.25) !important;
}
.cm-editor .cm-selectionMatch {
    background-color: rgba(249, 168, 37, 0.3);
}

.cm-h1, .cm-h2, .cm-h3, .cm-h4, .cm-h5, .cm-h6 {
    color: #d32f2f;
    font-weight: bold;
}
.cm-h1 { font-size: 1.5em; }
.cm-h2 { font-size: 1.3em; }
.cm-h3 { font-size: 1.1em; }
.cm-keyword { color: #7b1fa2; }
.cm-atom { color: #f57c00; }
.cm-number { color: #f57c00; }
.cm-string { color: #388e3c; }
.cm-comment { color: #757575; font-style: italic; }

.cm-link { color: var(--color-accent-link); text-decoration: underline; }
.cm-url { color: var(--color-accent-url); text-decoration: underline; }
.cm-file-path { color: var(--color-accent-filepath); text-decoration: underline; }

.cm-emphasis { font-style: italic; }
.cm-strong { font-weight: bold; }

/* Markdown Elements */
.cm-highlight {
    background-color: var(--color-bg-highlight);
    color: inherit;
}
.cm-strikethrough {
    text-decoration: line-through;
    opacity: 0.8;
}
.cm-code {
    background-color: var(--color-bg-code);
    color: var(--color-fg-code);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}
.cm-codeMark {
    background-color: transparent !important;
    color: #374151 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    font-family: inherit !important;
}
/* Removed border/bg from base class to prevent duplication. Handled by app.css via plugins */
.cm-blockquote {
    color: var(--color-fg-muted);
    font-style: italic;
}

/* --- PREVIEW CONTENT --- */
.prose {
    --tw-prose-body: #374151;
    --tw-prose-headings: #d32f2f;
    --tw-prose-links: #1976d2;
    --tw-prose-code: #f9a825;
    --tw-prose-quotes: #757575;
}
.prose h1 {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.3em;
}
.prose blockquote {
    border-left: 4px solid #7b1fa2;
    background: rgba(123, 31, 162, 0.05);
}
`;

export const DEFAULT_THEMES: Record<string, string> = {
    "default-dark": DEFAULT_DARK_CSS,
    "default-light": DEFAULT_LIGHT_CSS
};

export async function getThemeCss(themeName: string): Promise<string> {
    if (themeName in DEFAULT_THEMES) {
        return DEFAULT_THEMES[themeName];
    }

    try {
        return await callBackend<string>("get_theme_css", { themeName }, "Settings:Load");
    } catch (e) {
        console.error(`Failed to load theme '${themeName}':`, e);
        return "";
    }
}
