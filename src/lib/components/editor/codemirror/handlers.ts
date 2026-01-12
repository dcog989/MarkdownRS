import { prefetchSuggestions } from '$lib/utils/spellcheck.svelte.ts';
import { EditorView } from '@codemirror/view';

/**
 * Handles smart backtick insertion for code blocks.
 * Converts `` ` `` to a fenced code block if on a new line,
 * or handles inline code backticks.
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

        // Auto-close single backtick
        view.dispatch({
            changes: { from, to, insert: '``' },
            selection: { anchor: from + 1 },
        });
        return true;
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
