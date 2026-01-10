import { toggleInsertMode } from "$lib/stores/editorMetrics.svelte";
import { appContext } from "$lib/stores/state.svelte.ts";
import { scrollSync } from "$lib/utils/scrollSync.svelte.ts";
import { autocompletion, closeBracketsKeymap, completeAnyWord, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";

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
                    ".cm-content": { maxWidth: `${column}ch` },
                    ".cm-scroller": { width: "100%" },
                })
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
                if (nextChar === " " || nextChar === "\t") end++;
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

export function getEditorKeymap(customKeymap: any[] = []) {
    return keymap.of([
        ...customKeymap,
        indentWithTab,
        {
            key: "Insert",
            run: () => {
                toggleInsertMode();
                return true;
            },
        },
        {
            key: "Mod-Home",
            run: (v) => {
                v.dispatch({ selection: { anchor: 0 } });
                scrollSync.handleFastScroll(v, 0);
                return true;
            },
        },
        {
            key: "Mod-End",
            run: (v) => {
                v.dispatch({ selection: { anchor: v.state.doc.length } });
                scrollSync.handleFastScroll(v, v.scrollDOM.scrollHeight);
                return true;
            },
        },
        {
            key: "PageDown",
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
            key: "PageUp",
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
        ...defaultKeymap,
    ]);
}
