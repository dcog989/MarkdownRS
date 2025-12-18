import { addToDictionary } from "$lib/utils/fileSystem";
import { isWordValid, refreshCustomDictionary } from "$lib/utils/spellcheck.svelte.ts";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

export const createSpellCheckLinter = () => linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;
    const wordRegex = /\b[a-zA-Z][a-zA-Z']*[a-zA-Z]\b|\b[a-zA-Z]\b/g;
    const text = doc.toString();
    const tree = syntaxTree(view.state);

    let match;
    while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        const from = match.index;
        const to = match.index + word.length;

        if (word.length <= 1) continue;

        const node = tree.resolveInner(from, 1);
        const nodeType = node.type.name;
        if (
            nodeType.includes("Code") ||
            nodeType.includes("Url") ||
            nodeType.includes("URL") ||
            nodeType.includes("Link") ||
            nodeType.includes("Image") ||
            nodeType.includes("Autolink")
        ) {
            continue;
        }

        const contextStart = Math.max(0, from - 20);
        const contextEnd = Math.min(text.length, to + 20);
        const context = text.slice(contextStart, contextEnd);

        if (
            context.includes('http://') ||
            context.includes('https://') ||
            context.includes('www.') ||
            context.includes('://') ||
            /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(context)
        ) {
            continue;
        }

        if (/[a-z][A-Z]/.test(word)) {
            continue;
        }

        if (!isWordValid(word)) {
            diagnostics.push({
                from,
                to,
                severity: "warning",
                message: `Misspelled: ${word}`,
                source: "Spellchecker",
            });
        }
    }

    return diagnostics;
});

export async function refreshSpellcheck(view: EditorView | undefined) {
    if (!view) return;
    await refreshCustomDictionary();

    view.dispatch({
        changes: { from: 0, to: 0, insert: " " },
    });
    view.dispatch({
        changes: { from: 0, to: 1, insert: "" },
    });
}

export const spellCheckKeymap = [
    {
        key: "F8",
        run: (view: EditorView) => {
            const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);

            if (selection && selection.trim().length > 0) {
                const words = selection.split(/\s+/).map(w => w.replace(/[^a-zA-Z'-]/g, ""));
                Promise.all(words.map((w) => addToDictionary(w))).then(() => {
                    refreshSpellcheck(view);
                });
            } else {
                const range = view.state.wordAt(view.state.selection.main.head);
                if (range) {
                    const word = view.state.sliceDoc(range.from, range.to);
                    addToDictionary(word).then(() => {
                        refreshSpellcheck(view);
                    });
                }
            }
            return true;
        },
    },
];
