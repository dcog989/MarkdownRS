import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { addToDictionary } from "$lib/utils/fileSystem";
import { refreshCustomDictionary, spellcheckState } from "$lib/utils/spellcheck.svelte.ts";
import { syntaxTree } from "@codemirror/language";
import { forceLinting, linter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

let lintGeneration = 0;

export const createSpellCheckLinter = () => linter(async (view) => {
    if (!spellcheckState.dictionaryLoaded) return [];

    const currentGeneration = lintGeneration;
    const { state } = view;
    const doc = state.doc;
    const wordsToVerify = new Map<string, { from: number; to: number }[]>();

    const safeNodeTypes = new Set([
        "Paragraph", "Text", "Emphasis", "StrongEmphasis",
        "ListItem", "HeaderMark", "SetextHeading1", "SetextHeading2"
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
                const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;
                let match;

                while ((match = wordRegex.exec(nodeText)) !== null) {
                    const word = match[0];
                    if (word.length <= 1) continue;

                    const globalFrom = node.from + match.index;
                    const globalTo = globalFrom + word.length;

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

        if (currentGeneration !== lintGeneration) {
            return [];
        }

        const newCache = new Set<string>();
        const diagnostics: Diagnostic[] = [];
        const diagnosticKeys = new Set<string>();

        for (const word of misspelled) {
            const wLower = word.toLowerCase();
            if (customDict.has(wLower)) continue;

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

export function triggerImmediateLint(view: EditorView) {
    // Increment generation to invalidate any in-flight lint operations
    lintGeneration++;

    // First clear all diagnostics to force a clean re-lint
    const transaction = setDiagnostics(view.state, []);
    view.dispatch(view.state.update(transaction));
    // Then force a new lint run
    forceLinting(view);
}

export async function refreshSpellcheck(view: EditorView | undefined) {
    if (!view) return;

    // First, reload the custom dictionary from backend
    await refreshCustomDictionary();

    // Clear misspelled cache for words that are now in the custom dictionary
    const updatedCache = new Set<string>();
    for (const word of spellcheckState.misspelledCache) {
        if (!spellcheckState.customDictionary.has(word)) {
            updatedCache.add(word);
        }
    }
    spellcheckState.misspelledCache = updatedCache;

    // Force immediate re-lint to update diagnostics
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
