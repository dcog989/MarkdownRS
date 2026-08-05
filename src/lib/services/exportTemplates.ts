function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sanitizes a CSS font-family value so it cannot break out of the declaration
// with `;`, `{`, `}`, or a backslash escape. Quoted multi-word font names are
// preserved.
function escapeCssUnity(value: string): string {
  return value.replace(/[;{}\\]/g, '');
}

export function buildExportHtml(
  title: string,
  bodyContent: string,
  theme: string,
  fontFamily: string,
  baseVars: string,
): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        ${baseVars}
        body {
            margin: 0;
            padding: 2rem;
            background-color: var(--editor-bg);
            color: var(--editor-preview-fg-body);
            font-family: ${escapeCssUnity(fontFamily)};
            line-height: 1.6;
        }
        .prose { max-width: 800px; margin: 0 auto; }

        h1, h2, h3, h4, h5, h6 { color: var(--editor-preview-fg-heading); font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 1.7em; border-bottom: 1px solid var(--editor-border); padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid var(--editor-border); padding-bottom: 0.3em; }
        h3 { font-size: 1.3em; }
        h4, h5, h6 { font-size: 1.1em; }

        a { color: var(--editor-preview-fg-link); text-decoration: underline; }

        code {
            color: var(--editor-preview-fg-code);
            background-color: var(--editor-preview-bg-code);
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-family: monospace;
        }

        pre {
            background-color: var(--editor-preview-bg-pre);
            color: var(--editor-preview-fg-pre);
            padding: 1em;
            border-radius: 4px;
            overflow: auto;
            margin: 1em 0;
        }

        pre code { background: transparent; padding: 0; color: inherit; }

        blockquote {
            color: var(--editor-preview-fg-quote);
            background-color: var(--editor-preview-bg-quote);
            border-left: 4px solid var(--editor-preview-border-quote);
            padding: 0.5em 1em;
            margin: 1em 0;
            font-style: italic;
        }

        table { width: 100%; border-collapse: collapse; margin: 1em 0; }
        th, td { border: 1px solid var(--editor-border); padding: 0.5em; text-align: left; }
        img { max-width: 100%; height: auto; }
        hr { border: 0; border-top: 1px solid var(--editor-border); margin: 2em 0; }
    </style>
</head>
<body>
    <div class="prose">${bodyContent}</div>
</body>
</html>`;
}
