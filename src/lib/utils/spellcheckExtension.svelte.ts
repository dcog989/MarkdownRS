import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { addToDictionary } from "$lib/utils/fileSystem";
import { refreshCustomDictionary, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
import { syntaxTree } from "@codemirror/language";
import { forceLinting, linter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

let lintGeneration = 0;

export const createSpellCheckLinter = () => {
    return linter(async (view) => {
        if (!spellcheckState.dictionaryLoaded) {
            return [];
        }

        const { state } = view;
        const doc = state.doc;
        const wordsToVerify = new Map<string, { from: number; to: number }[]>();

        const safeNodeTypes = new Set([
            "Paragraph", "Text", "Emphasis", "StrongEmphasis",
            "ListItem", "HeaderMark", "SetextHeading1", "SetextHeading2", "ATXHeading1", "ATXHeading2", "ATXHeading3"
        ]);

        const customDict = new Set(spellcheckState.customDictionary);

        syntaxTree(state).iterate({
            enter: (node: SyntaxNodeRef): boolean | void => {
                if (
                    node.name.includes("Code") ||
                    node.name.includes("Link") ||
                    node.name.includes("Url") ||
                    node.name.includes("Comment") ||
                    node.name.includes("Attribute") ||
                    node.name === "HtmlTag"
                ) return false;

                if (safeNodeTypes.has(node.name)) {
                    const nodeText = doc.sliceString(node.from, node.to);
                    // Match words, including contractions
                    const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;
                    let match;

                    while ((match = wordRegex.exec(nodeText)) !== null) {
                        const word = match[0];
                        if (word.length <= 1) continue;

                        const globalFrom = node.from + match.index;
                        const globalTo = globalFrom + word.length;

                        // Basic heuristic to skip emails/paths
                        const charBefore = globalFrom > 0 ? doc.sliceString(globalFrom - 1, globalFrom) : "";
                        const charAfter = globalTo < doc.length ? doc.sliceString(globalTo, globalTo + 1) : "";

                        if (/[\\/:@\.~]/.test(charBefore) || /[\\/:@]/.test(charAfter)) continue;
                        if (/\d/.test(word) || /[a-z][A-Z]/.test(word)) continue;

                        const wLower = word.toLowerCase();
                        if (customDict.has(wLower)) continue;

                        const ranges = wordsToVerify.get(word) || [];
                        ranges.push({ from: globalFrom, to: globalTo });
                        wordsToVerify.set(word, ranges);
                    }
                }
            }
        });

        if (wordsToVerify.size === 0) return [];

        try {
            const misspelled = await callBackend<string[]>('check_words', {
                words: Array.from(wordsToVerify.keys())
            }, 'Editor:Init');

            const newCache = new Set<string>();
            const diagnostics: Diagnostic[] = [];
            const diagnosticKeys = new Set<string>();

            for (const word of misspelled) {
                const wLower = word.toLowerCase();
                // Check custom dict again in case it updated while awaiting
                if (spellcheckState.customDictionary.has(wLower)) continue;

                newCache.add(wLower);
                const ranges = wordsToVerify.get(word);
                if (ranges) {
                    for (const range of ranges) {
                        const key = `${range.from}-${range.to}`;
                        if (!diagnosticKeys.has(key)) {
                            diagnosticKeys.add(key);
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
            }

            spellcheckState.misspelledCache = newCache;
            return diagnostics;
        } catch (err) {
            return [];
        }
    }, { delay: CONFIG.SPELLCHECK.LINT_DELAY_MS });
};

export function triggerImmediateLint(view: EditorView) {
    lintGeneration++;
    const transaction = setDiagnostics(view.state, []);
    view.dispatch(view.state.update(transaction));
    forceLinting(view);
}

export async function refreshSpellcheck(view: EditorView | undefined) {
    if (!view) return;

    await refreshCustomDictionary();

    // Clear the misspelled cache to force a full re-check
    // The linter will rebuild it with all misspelled words
    spellcheckState.misspelledCache = new Set<string>();

    triggerImmediateLint(view);
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
