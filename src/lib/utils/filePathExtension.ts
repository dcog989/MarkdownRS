import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

// Regex to match file paths
// Groups:
// 1. Quoted paths: Allow spaces/anything inside quotes.
// 2. Unquoted paths:
//    a. Windows/Relative/Home:
//       - ALLOW spaces IF the path ends in a file extension (e.g. .md, .txt).
//       - Otherwise, stop at the first whitespace.
//    b. Unix Absolute:
//       - Must start with /.
//       - STRICTLY no spaces allowed (must be quoted for spaces).
//       - This prevents identifying "/either/or" text as a path with spaces.
export const FILE_PATH_REGEX =
    /(?:(?:^|\s)(['"`])(?=[/\\~a-zA-Z.][^'"`\r\n]*?[/\\][^'"`\r\n]*?)\1)|(?:(?:^|\s)(?:(?:[a-zA-Z]:[/\\]|(?:\.{1,2}|~)[/\\])(?:[^"'\r\n]+?\.[a-zA-Z0-9]{1,10}(?=\s|$|[.,;:?!])|[^"'\s]+)|(?:\/[^"'\s]+)))/g;

/**
 * Extracts a file path from a line of text at a specific position.
 * Returns the path string if the position is within a valid path, or null.
 */
export function extractPathAtPos(text: string, pos: number): string | null {
    FILE_PATH_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
        const fullMatch = match[0];
        const trimmedMatch = fullMatch.trim();

        const leadingSpaceCount = fullMatch.length - fullMatch.trimStart().length;
        const quoteStartOffset = trimmedMatch.match(/^['"`]/) ? 1 : 0;
        const quoteEndOffset = trimmedMatch.match(/['"`]$/) ? 1 : 0;

        const cleanPath = trimmedMatch.slice(
            quoteStartOffset,
            trimmedMatch.length - (quoteEndOffset && quoteStartOffset ? 1 : 0),
        );

        const start = match.index + leadingSpaceCount + quoteStartOffset;
        const end = start + cleanPath.length;

        if (pos >= start && pos <= end) {
            return cleanPath;
        }
    }
    return null;
}

// Mark to apply to file paths
const filePathMark = Decoration.mark({
    class: 'cm-file-path',
});

function findFilePaths(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = doc.lineAt(pos);
            const lineText = line.text;

            // Reset regex
            FILE_PATH_REGEX.lastIndex = 0;

            let match: RegExpExecArray | null;
            while ((match = FILE_PATH_REGEX.exec(lineText)) !== null) {
                const fullMatch = match[0];
                const trimmedMatch = fullMatch.trim();

                const leadingSpaceCount = fullMatch.length - fullMatch.trimStart().length;
                const quoteStartOffset = trimmedMatch.match(/^['"`]/) ? 1 : 0;
                const quoteEndOffset = trimmedMatch.match(/['"`]$/) ? 1 : 0;

                const cleanPath = trimmedMatch.slice(
                    quoteStartOffset,
                    trimmedMatch.length - (quoteEndOffset && quoteStartOffset ? 1 : 0),
                );

                const startOffset = match.index + leadingSpaceCount + quoteStartOffset;
                const matchFrom = line.from + startOffset;
                const matchTo = matchFrom + cleanPath.length;

                builder.add(matchFrom, matchTo, filePathMark);
            }

            pos = line.to + 1;
        }
    }

    return builder.finish();
}

export const filePathPlugin: Extension = ViewPlugin.fromClass(
    class {
        decorations;

        constructor(view: EditorView) {
            this.decorations = findFilePaths(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = findFilePaths(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);

// Theme to style file paths
export const filePathTheme = EditorView.baseTheme({
    '.cm-file-path': {
        color: 'var(--color-accent-link)',
        textDecoration: 'underline',
        '&:hover': {
            color: 'var(--color-accent-link-hover)',
            textDecoration: 'underline',
        },
    },
    // Only show pointer cursor when the editor has the modifier-down class
    '&.cm-modifier-down .cm-file-path': {
        cursor: 'pointer',
    },
});
