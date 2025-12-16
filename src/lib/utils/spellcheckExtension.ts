import { addToDictionary } from "$lib/utils/fileSystem";
import { isWordValid, refreshCustomDictionary } from "$lib/utils/spellcheck";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

/**
 * Creates the CodeMirror linter extension for spell checking.
 */
export const createSpellCheckLinter = () => linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;
    // Matches pure alpha words with optional apostrophes for possessives/contractions
    const wordRegex = /\b[a-zA-Z][a-zA-Z']*[a-zA-Z]\b|\b[a-zA-Z]\b/g;
    const text = doc.toString();
    const tree = syntaxTree(view.state);

    let match;
    while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        const from = match.index;
        const to = match.index + word.length;

        if (word.length <= 1) continue;

        // 1. Syntax Context Check
        // Ignore words inside Code Blocks, Inline Code, URLs, or Links
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

        // 2. URL Pattern Check (catches URLs that might not be in link syntax)
        // Check if word is part of a URL pattern
        const contextStart = Math.max(0, from - 20);
        const contextEnd = Math.min(text.length, to + 20);
        const context = text.slice(contextStart, contextEnd);
        
        // Common URL patterns
        if (
            context.includes('http://') ||
            context.includes('https://') ||
            context.includes('www.') ||
            context.includes('://') ||
            /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(context) // domain pattern
        ) {
            continue;
        }

        // 3. Mixed Case Check (CamelCase, PascalCase, iPhone)
        if (/[a-z][A-Z]/.test(word)) {
            continue;
        }

        // 4. Dictionary Check
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

/**
 * Refreshes the spell checker by reloading the dictionary and forcing a re-lint.
 */
export async function refreshSpellcheck(view: EditorView | undefined) {
    if (!view) return;
    await refreshCustomDictionary();

    // Force linter to re-run by making a micro-change to the document
    // This triggers the update listener and re-evaluates the linter
    view.dispatch({
        changes: { from: 0, to: 0, insert: " " },
    });
    view.dispatch({
        changes: { from: 0, to: 1, insert: "" },
    });
}

/**
 * Custom Keymap to handle F8 (Add to Dictionary)
 */
export const spellCheckKeymap = [
    {
        key: "F8",
        run: (view: EditorView) => {
            const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);

            if (selection && selection.trim().length > 0) {
                // Handle selection (potentially multiple words)
                const words = selection.split(/\s+/).map(w => w.replace(/[^a-zA-Z'-]/g, ""));
                Promise.all(words.map((w) => addToDictionary(w))).then(() => {
                    refreshSpellcheck(view);
                });
            } else {
                // Handle word under cursor
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
