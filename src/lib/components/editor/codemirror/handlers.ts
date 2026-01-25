import { prefetchSuggestions } from '$lib/utils/spellcheck.svelte.ts';
import { EditorView } from '@codemirror/view';

/**
 * Handles smart backtick insertion for code blocks.
 * Only auto-completes backticks if there's whitespace or start/end of line before/after.
 */
export const smartBacktickHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (text === '`' && from === to) {
        const state = view.state;
        const before = state.sliceDoc(Math.max(0, from - 2), from);
        const after = state.sliceDoc(from, from + 1);

        // Skip over closing backtick if it exists
        if (after === '`' && state.sliceDoc(Math.max(0, from - 1), from) === '`') {
            view.dispatch({ selection: { anchor: from + 1 } });
            return true;
        }

        // Handle triple backtick expansion
        if (before === '``') {
            const line = state.doc.lineAt(from);
            const textBefore = line.text.slice(0, from - line.from - 2);

            // Only expand if line contains only whitespace before the backticks
            if (/^\s*$/.test(textBefore)) {
                const indent = textBefore;
                view.dispatch({
                    changes: {
                        from,
                        to,
                        insert: '`\n' + indent + '\n' + indent + '```',
                    },
                    selection: { anchor: from + 1 + indent.length + 1 },
                });
                return true;
            }
        }

        // Check for whitespace or start/end of document before/after cursor
        const charBefore = from > 0 ? state.sliceDoc(from - 1, from) : '';
        const charAfter = from < state.doc.length ? state.sliceDoc(from, from + 1) : '';

        const isWhitespaceBefore = from === 0 || /\s/.test(charBefore);
        const isWhitespaceAfter = from === state.doc.length || /\s/.test(charAfter);

        // Only auto-close if there's whitespace or document boundary on both sides
        if (isWhitespaceBefore && isWhitespaceAfter) {
            view.dispatch({
                changes: { from, to, insert: '``' },
                selection: { anchor: from + 1 },
            });
            return true;
        }
    }
    return false;
});

/**
 * Prefetches spellcheck suggestions on mouse hover
 */
export const prefetchHoverHandler = EditorView.domEventHandlers({
    mousemove: (event, view) => {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return;
        const range = view.state.wordAt(pos);
        if (range) {
            const word = view.state.sliceDoc(range.from, range.to);
            prefetchSuggestions(word);
        }
        return false;
    },
});

/**
 * Auto-renumbering disabled - feature was causing incorrect renumbering
 * Users can manually renumber lists as needed
 */
export const autoRenumberLists = EditorView.updateListener.of(() => {
    // Disabled - was causing 1,2,1,2 renumbering issues
    return;
});
