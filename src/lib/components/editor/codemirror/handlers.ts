import { prefetchSuggestions } from '$lib/utils/spellcheck.svelte.ts';
import type { ChangeSpec } from '@codemirror/state';
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
 * Auto-renumbers ordered lists when items are added or deleted.
 * Handles sequential numbered lists (1. 2. 3. etc.)
 */
export const autoRenumberLists = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;

    const { state } = update;
    const changes: ChangeSpec[] = [];

    // Track which lines we've already processed to avoid duplicate renumbering
    const processedLines = new Set<number>();

    // Iterate through document changes
    update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        // Find the start and end lines affected by the change
        const startLine = state.doc.lineAt(fromB);
        const endLinePos = Math.min(toB, state.doc.length);
        const endLine = endLinePos > 0 ? state.doc.lineAt(endLinePos) : startLine;

        // Scan from a few lines before to catch list continuations
        const scanStartLine = Math.max(1, startLine.number - 2);
        const scanEndLine = Math.min(state.doc.lines, endLine.number + 10);

        // Find all consecutive numbered list items
        let currentListStart = -1;
        const listItems: { line: number; from: number; to: number; currentNum: number }[] = [];

        for (let lineNum = scanStartLine; lineNum <= scanEndLine; lineNum++) {
            if (processedLines.has(lineNum)) continue;

            const line = state.doc.line(lineNum);
            const match = /^(\s*)(\d+)(\.\s+)/.exec(line.text);

            if (match) {
                const indent = match[1];
                const num = parseInt(match[2], 10);
                const numStart = line.from + indent.length;
                const numEnd = numStart + match[2].length;

                if (currentListStart === -1) {
                    currentListStart = lineNum;
                    listItems.length = 0;
                }

                listItems.push({
                    line: lineNum,
                    from: numStart,
                    to: numEnd,
                    currentNum: num,
                });
            } else if (currentListStart !== -1 && !/^\s*$/.test(line.text)) {
                // Non-empty, non-list line breaks the list
                renumberList(listItems, changes, processedLines);
                currentListStart = -1;
                listItems.length = 0;
            }
        }

        // Renumber any remaining list at the end
        if (listItems.length > 0) {
            renumberList(listItems, changes, processedLines);
        }
    });

    if (changes.length > 0) {
        update.view.dispatch({ changes });
    }
});

function renumberList(
    items: { line: number; from: number; to: number; currentNum: number }[],
    changes: ChangeSpec[],
    processedLines: Set<number>,
) {
    let expectedNum = 1;
    for (const item of items) {
        if (item.currentNum !== expectedNum) {
            changes.push({
                from: item.from,
                to: item.to,
                insert: String(expectedNum),
            });
        }
        processedLines.add(item.line);
        expectedNum++;
    }
}
