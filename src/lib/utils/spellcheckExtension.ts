import { addToDictionary } from "$lib/utils/fileSystem";
import { refreshCustomDictionary, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";

export const createSpellCheckLinter = () => linter(async (view) => {
    if (!spellcheckState.dictionaryLoaded) return [];

    const doc = view.state.doc;
    const text = doc.toString();
    const tree = syntaxTree(view.state);

    // Improved regex to capture words with apostrophes but ignore numbers/symbols
    const wordRegex = /[a-zA-Z]+(?:'[a-zA-Z]+)?/g;
    const wordsToVerify = new Map<string, { from: number; to: number }[]>();
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        if (word.length <= 1) continue;

        const from = match.index;
        const to = from + word.length;

        // Use resolveInner to find the specific syntax node at this position
        const node = tree.resolveInner(from, 1);
        const type = node.type.name;

        // Skip non-textual Markdown elements
        if (
            type.includes("Code") ||
            type.includes("Link") ||
            type.includes("Url") ||
            type.includes("Header") ||
            type.includes("Comment")
        ) continue;

        const wLower = word.toLowerCase();
        if (spellcheckState.customDictionary.has(wLower)) continue;

        // Skip CamelCase (likely code or intentional identifiers)
        if (/[a-z][A-Z]/.test(word)) continue;

        const ranges = wordsToVerify.get(word) || [];
        ranges.push({ from, to });
        wordsToVerify.set(word, ranges);
    }

    if (wordsToVerify.size === 0) return [];

    try {
        const misspelled = await invoke<string[]>('check_words', {
            words: Array.from(wordsToVerify.keys())
        });

        const newCache = new Set<string>();
        const diagnostics: Diagnostic[] = [];

        for (const word of misspelled) {
            newCache.add(word.toLowerCase());
            const ranges = wordsToVerify.get(word);
            if (ranges) {
                for (const range of ranges) {
                    diagnostics.push({
                        from: range.from,
                        to: range.to,
                        severity: "error",
                        message: `Misspelled: ${word}`,
                        source: "Spellchecker"
                    });
                }
            }
        }

        spellcheckState.misspelledCache = newCache;
        return diagnostics;
    } catch (err) {
        console.error("Spellcheck linter error:", err);
        return [];
    }
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
