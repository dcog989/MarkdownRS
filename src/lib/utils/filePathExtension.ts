import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

// --- REGEX DEFINITIONS ---

// Matches URLs (http, https, www).
// Excludes common delimiters to prevent capturing surrounding brackets/quotes.
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s"'`(){}[\]<>]+/g;

// Matches Quoted File Paths.
// Group 1: Opening Quote
// Group 2: Content
// Logic:
// - Must start with a quote.
// - Content MUST NOT start with http/https/www (Negative Lookahead).
// - Content must contain a slash OR end with an extension.
// - Ends with matching quote.
const QUOTED_PATH_REGEX =
    /(['"`])((?!(?:https?:\/\/|www\.))(?:[^'"`\r\n]*?[/\\][^'"`\r\n]*?|[^'"`\r\n]+?\.[a-zA-Z0-9]{1,10}))\1/g;

// Matches Unquoted File Paths.
// Logic:
// - Start: Drive letter, relative (./, ../), home (~/), or root (/).
// - Body:
//   Option A: Path with extension (Allows spaces, stops at delimiter lookahead).
//   Option B: Path without spaces (No delimiters).
const UNQUOTED_PATH_REGEX =
    /(?:[a-zA-Z]:[/\\]|(?:\.{1,2}|~)[/\\]|(?:\/))(?:[^"'\r\n(){}[\]<>]+?\.[a-zA-Z0-9]{1,10}(?=[\s)\]}>.,;:?!]|$)|[^"'\s(){}[\]<>]+)/g;

// --- HELPERS ---

function stripTrailingPunctuation(str: string): string {
    return str.replace(/[.,;:?!]+$/, '');
}

/**
 * Extracts a file path or URL from a line of text at a specific position.
 * Returns the cleaned string if the position is within a valid match, or null.
 */
export function extractPathAtPos(text: string, pos: number): string | null {
    let match: RegExpExecArray | null;

    // 1. Check URLs
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(text)) !== null) {
        const cleanMatch = stripTrailingPunctuation(match[0]);
        const start = match.index;
        const end = start + cleanMatch.length;

        if (pos >= start && pos < end) return cleanMatch;
    }

    // 2. Check Quoted Paths
    QUOTED_PATH_REGEX.lastIndex = 0;
    while ((match = QUOTED_PATH_REGEX.exec(text)) !== null) {
        const content = match[2];
        const start = match.index + 1; // Skip opening quote
        const end = start + content.length;

        if (pos >= start && pos < end) return content;
    }

    // 3. Check Unquoted Paths
    UNQUOTED_PATH_REGEX.lastIndex = 0;
    while ((match = UNQUOTED_PATH_REGEX.exec(text)) !== null) {
        const cleanMatch = stripTrailingPunctuation(match[0]);
        const start = match.index;
        const end = start + cleanMatch.length;

        if (pos >= start && pos < end) return cleanMatch;
    }

    return null;
}

// --- VIEW PLUGIN ---

const filePathMark = Decoration.mark({ class: 'cm-file-path' });
const urlMark = Decoration.mark({ class: 'cm-url' });

function findLinks(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = doc.lineAt(pos);
            const lineText = line.text;

            const found: { start: number; end: number; deco: Decoration }[] = [];
            let match: RegExpExecArray | null;

            // 1. URLs
            URL_REGEX.lastIndex = 0;
            while ((match = URL_REGEX.exec(lineText)) !== null) {
                const clean = stripTrailingPunctuation(match[0]);
                const start = line.from + match.index;
                if (clean.length > 0) {
                    found.push({ start, end: start + clean.length, deco: urlMark });
                }
            }

            // 2. Quoted Paths
            QUOTED_PATH_REGEX.lastIndex = 0;
            while ((match = QUOTED_PATH_REGEX.exec(lineText)) !== null) {
                const content = match[2];
                const start = line.from + match.index + 1;
                if (content.length > 0) {
                    found.push({ start, end: start + content.length, deco: filePathMark });
                }
            }

            // 3. Unquoted Paths
            UNQUOTED_PATH_REGEX.lastIndex = 0;
            while ((match = UNQUOTED_PATH_REGEX.exec(lineText)) !== null) {
                const clean = stripTrailingPunctuation(match[0]);
                const start = line.from + match.index;
                if (clean.length > 0) {
                    found.push({ start, end: start + clean.length, deco: filePathMark });
                }
            }

            // Sort by position
            found.sort((a, b) => a.start - b.start);

            let lastEnd = -1;
            for (const f of found) {
                if (f.start >= lastEnd) {
                    builder.add(f.start, f.end, f.deco);
                    lastEnd = f.end;
                }
            }

            pos = line.to + 1;
        }
    }

    return builder.finish();
}

export const linkPlugin: Extension = ViewPlugin.fromClass(
    class {
        decorations;

        constructor(view: EditorView) {
            this.decorations = findLinks(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = findLinks(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);

export const linkTheme = EditorView.baseTheme({
    '.cm-file-path, .cm-url': {
        color: 'var(--color-accent-link)',
        textDecoration: 'underline',
        '&:hover': {
            color: 'var(--color-accent-link-hover)',
            textDecoration: 'underline',
        },
    },
    '&.cm-modifier-down .cm-file-path, &.cm-modifier-down .cm-url': {
        cursor: 'pointer',
    },
});
