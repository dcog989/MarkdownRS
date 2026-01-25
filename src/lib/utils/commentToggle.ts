import type { EditorView } from '@codemirror/view';

/**
 * Custom comment toggle that wraps only selected text in HTML comments,
 * rather than entire lines. Falls back to line-level commenting when no selection.
 */
export function toggleSelectionComment(view: EditorView): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;
    const hasSelection = from !== to;

    if (hasSelection) {
        // Get the selected text
        const selectedText = state.sliceDoc(from, to);

        // Check if already wrapped in comment
        const isCommented =
            selectedText.startsWith('<!-- ') &&
            selectedText.endsWith(' -->') &&
            selectedText.length > 9;

        if (isCommented) {
            // Unwrap: remove the comment markers
            const uncommented = selectedText.slice(5, -4);
            view.dispatch({
                changes: { from, to, insert: uncommented },
                selection: { anchor: from, head: from + uncommented.length },
                scrollIntoView: true,
            });
        } else {
            // Wrap: add comment markers around selection
            const commented = `<!-- ${selectedText} -->`;
            view.dispatch({
                changes: { from, to, insert: commented },
                selection: { anchor: from, head: from + commented.length },
                scrollIntoView: true,
            });
        }
        return true;
    }

    // No selection: toggle comment for entire line(s)
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    // Check if all lines are commented
    let allCommented = true;
    for (let i = startLine.number; i <= endLine.number; i++) {
        const line = state.doc.line(i);
        const lineText = line.text.trim();
        if (lineText && !lineText.startsWith('<!--') && !lineText.endsWith('-->')) {
            allCommented = false;
            break;
        }
    }

    const changes = [];

    if (allCommented) {
        // Uncomment all lines
        for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            const lineText = line.text;

            // Match leading whitespace
            const leadingSpace = lineText.match(/^(\s*)/)?.[1] || '';
            const content = lineText.slice(leadingSpace.length);

            if (content.startsWith('<!-- ') && content.endsWith(' -->')) {
                const uncommented = content.slice(5, -4);
                changes.push({
                    from: line.from,
                    to: line.to,
                    insert: leadingSpace + uncommented,
                });
            } else if (content.startsWith('<!--') && content.endsWith('-->')) {
                const uncommented = content.slice(4, -3).trim();
                changes.push({
                    from: line.from,
                    to: line.to,
                    insert: leadingSpace + uncommented,
                });
            }
        }
    } else {
        // Comment all lines
        for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            const lineText = line.text;

            // Match leading whitespace
            const leadingSpace = lineText.match(/^(\s*)/)?.[1] || '';
            const content = lineText.slice(leadingSpace.length);

            if (content) {
                changes.push({
                    from: line.from,
                    to: line.to,
                    insert: `${leadingSpace}<!-- ${content} -->`,
                });
            }
        }
    }

    if (changes.length > 0) {
        view.dispatch({
            changes,
            scrollIntoView: true,
        });
    }

    return true;
}
