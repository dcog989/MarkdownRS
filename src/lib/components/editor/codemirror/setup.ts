import { appContext } from '$lib/stores/state.svelte.ts';
import { autocompletion, completeAnyWord } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

export function getAutocompletionConfig() {
    if (!appContext.app.enableAutocomplete) return [];
    return autocompletion({
        activateOnTyping: true,
        activateOnTypingDelay: appContext.app.autocompleteDelay,
        closeOnBlur: true,
        defaultKeymap: true,
        aboveCursor: false,
        maxRenderedOptions: 100,
        override: [completeAnyWord],
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
