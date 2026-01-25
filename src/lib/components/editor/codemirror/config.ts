import { toggleInsertMode } from '$lib/stores/editorMetrics.svelte';
import { appContext } from '$lib/stores/state.svelte.ts';
import { toggleSelectionComment } from '$lib/utils/commentToggle';
import { scrollSync } from '$lib/utils/scrollSync.svelte.ts';
import {
    autocompletion,
    closeBracketsKeymap,
    completeAnyWord,
    completionKeymap,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';

/**
 * Custom completion source that wraps completeAnyWord but filters out
 * candidates that match the currently typed word exactly.
 */
export function smartCompleteAnyWord(context: CompletionContext): CompletionResult | null {
    const result = completeAnyWord(context);
    // completeAnyWord is synchronous in standard CM6 but return type allows promise.
    // We assume synchronous for standard word completion.
    if (!result || 'then' in result) return result as CompletionResult | null;

    const before = context.matchBefore(/\w+/);
    if (!before) return result;

    const typed = before.text;

    // Filter out exact matches
    const filteredOptions = result.options.filter((opt) => opt.label !== typed);

    if (filteredOptions.length === 0) return null;

    return {
        ...result,
        options: filteredOptions,
    };
}

export function getAutocompletionConfig() {
    if (!appContext.app.enableAutocomplete) return [];
    return autocompletion({
        activateOnTyping: true,
        activateOnTypingDelay: appContext.app.autocompleteDelay,
        closeOnBlur: true,
        defaultKeymap: true,
        aboveCursor: false,
        maxRenderedOptions: 100,
        override: [smartCompleteAnyWord],
    });
}

export function createWrapExtension() {
    const wrapEnabled = appContext.app.editorWordWrap;
    const column = appContext.app.wrapGuideColumn;
    const extensions = [];
    if (wrapEnabled) {
        extensions.push(EditorView.lineWrapping);
        if (column > 0) {
            extensions.push(
                EditorView.theme({
                    '.cm-content': { maxWidth: `${column}ch` },
                    '.cm-scroller': { width: '100%' },
                }),
            );
        }
    }
    return extensions;
}

export function createDoubleClickHandler() {
    if (!appContext.app.doubleClickSelectsTrailingSpace) return [];
    return EditorView.domEventHandlers({
        dblclick: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            const range = view.state.wordAt(pos);
            if (!range) return false;
            let end = range.to;
            if (end < view.state.doc.length) {
                const nextChar = view.state.doc.sliceString(end, end + 1);
                if (nextChar === ' ' || nextChar === '\t') end++;
            }
            if (end > range.to) {
                view.dispatch({ selection: { anchor: range.from, head: end } });
                event.preventDefault();
                return true;
            }
            return false;
        },
    });
}

// Custom tab handler that indents selection or inserts spaces at cursor
const handleTabKey = (view: EditorView) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    const hasSelection = from !== to;

    // Get indent string from the indentUnit facet
    const indentStr = state.facet(indentUnit) || '    '; // Default to 4 spaces

    if (hasSelection) {
        // Indent selected lines
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(to);

        const changes = [];
        for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            changes.push({ from: line.from, insert: indentStr });
        }

        view.dispatch({
            changes,
            scrollIntoView: true,
        });
        return true;
    }

    // Insert spaces at cursor position
    view.dispatch({
        changes: { from, to, insert: indentStr },
        selection: { anchor: from + indentStr.length },
        scrollIntoView: true,
    });
    return true;
};

// Shift+Tab handler that unindents selected lines
const handleShiftTab = (view: EditorView) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    // Get indent string from the indentUnit facet
    const indentStr = state.facet(indentUnit) || '    '; // Default to 4 spaces
    const indentLen = indentStr.length;

    const changes = [];
    for (let i = startLine.number; i <= endLine.number; i++) {
        const line = state.doc.line(i);
        const lineText = line.text;

        // Check if line starts with the indent string
        if (lineText.startsWith(indentStr)) {
            changes.push({ from: line.from, to: line.from + indentLen, insert: '' });
        } else {
            // Remove as many leading spaces as possible (up to indentLen)
            let removeCount = 0;
            for (let j = 0; j < Math.min(indentLen, lineText.length); j++) {
                if (lineText[j] === ' ') removeCount++;
                else break;
            }
            if (removeCount > 0) {
                changes.push({ from: line.from, to: line.from + removeCount, insert: '' });
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
};

export function getEditorKeymap(customKeymap: KeyBinding[] = []) {
    return keymap.of([
        ...customKeymap,
        {
            key: 'Insert',
            run: () => {
                toggleInsertMode();
                return true;
            },
        },
        // Custom comment toggle that respects text selection
        { key: 'Mod-/', run: toggleSelectionComment },
        {
            key: 'Mod-Home',
            run: (v) => {
                v.dispatch({ selection: { anchor: 0 } });
                scrollSync.handleFastScroll(v, 0);
                return true;
            },
        },
        {
            key: 'Mod-End',
            run: (v) => {
                v.dispatch({ selection: { anchor: v.state.doc.length } });
                scrollSync.handleFastScroll(v, v.scrollDOM.scrollHeight);
                return true;
            },
        },
        {
            key: 'PageDown',
            run: (v) => {
                const newScrollTop = v.scrollDOM.scrollTop + v.scrollDOM.clientHeight;
                v.scrollDOM.scrollTop = newScrollTop;
                const lineBlock = v.lineBlockAtHeight(newScrollTop);
                v.dispatch({ selection: { anchor: lineBlock.from, head: lineBlock.from } });
                scrollSync.handleFastScroll(v, newScrollTop);
                return true;
            },
        },
        {
            key: 'PageUp',
            run: (v) => {
                const newScrollTop = Math.max(0, v.scrollDOM.scrollTop - v.scrollDOM.clientHeight);
                v.scrollDOM.scrollTop = newScrollTop;
                const lineBlock = v.lineBlockAtHeight(newScrollTop);
                v.dispatch({ selection: { anchor: lineBlock.from, head: lineBlock.from } });
                scrollSync.handleFastScroll(v, newScrollTop);
                return true;
            },
        },
        ...completionKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...defaultKeymap.filter((binding) => binding.key !== 'Tab'),
        // Our Tab handlers come last to override defaults
        { key: 'Tab', run: handleTabKey, shift: handleShiftTab },
    ]);
}
