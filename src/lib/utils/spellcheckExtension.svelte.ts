import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { addToDictionary } from '$lib/utils/fileSystem';
import { refreshCustomDictionary, spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import { syntaxTree } from '@codemirror/language';
import { forceLinting, linter, type Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

export const createSpellCheckLinter = () => {
    return linter(
        async (view) => {
            if (!spellcheckState.dictionaryLoaded) return [];

            const { state } = view;
            const doc = state.doc;
            const wordsToVerify = new Map<string, { from: number; to: number }[]>();

            const safeNodeTypes = new Set([
                'Paragraph',
                'Text',
                'Emphasis',
                'StrongEmphasis',
                'ListItem',
                'HeaderMark',
                'SetextHeading1',
                'SetextHeading2',
                'ATXHeading1',
                'ATXHeading2',
                'ATXHeading3',
            ]);

            // Snapshot dictionary for consistency during this pass
            const customDict = new Set(spellcheckState.customDictionary);

            syntaxTree(state).iterate({
                enter: (node: SyntaxNodeRef): boolean | void => {
                    if (
                        node.name.includes('Code') ||
                        node.name.includes('Link') ||
                        node.name.includes('Url') ||
                        node.name.includes('Comment') ||
                        node.name.includes('Attribute') ||
                        node.name === 'HtmlTag'
                    )
                        return false;

                    if (safeNodeTypes.has(node.name)) {
                        const nodeText = doc.sliceString(node.from, node.to);
                        // Include apostrophes in word matching
                        const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;
                        let match;

                        while ((match = wordRegex.exec(nodeText)) !== null) {
                            const word = match[0];
                            if (word.length <= 1) continue;

                            const globalFrom = node.from + match.index;
                            const globalTo = globalFrom + word.length;

                            // Heuristic: Skip if looks like path/url
                            const charBefore = globalFrom > 0 ? doc.sliceString(globalFrom - 1, globalFrom) : '';
                            const charAfter = globalTo < doc.length ? doc.sliceString(globalTo, globalTo + 1) : '';
                            if (/[\\/:@\.~]/.test(charBefore) || /[\\/:@]/.test(charAfter)) continue;

                            // Heuristic: Skip mixed case/numbers
                            if (/\d/.test(word) || /[a-z][A-Z]/.test(word)) continue;

                            const wLower = word.toLowerCase();

                            // Check custom dictionary (exact)
                            if (customDict.has(wLower)) continue;

                            // Check custom dictionary (possessive 's)
                            let checkWord = word;
                            if (wLower.endsWith("'s")) {
                                const base = wLower.slice(0, -2);
                                if (customDict.has(base)) continue;
                                // Use base form for backend check
                                checkWord = word.slice(0, -2);
                            }

                            const ranges = wordsToVerify.get(checkWord) || [];
                            ranges.push({ from: globalFrom, to: globalTo });
                            wordsToVerify.set(checkWord, ranges);
                        }
                    }
                },
            });

            if (wordsToVerify.size === 0) return [];

            try {
                const misspelled = await callBackend(
                    'check_words',
                    {
                        words: Array.from(wordsToVerify.keys()),
                    },
                    'Editor:Init',
                );

                if (!misspelled) {
                    return [];
                }

                const newCache = new Set<string>();
                const diagnostics: Diagnostic[] = [];
                const diagnosticKeys = new Set<string>();

                // Get fresh reference in case of updates during await
                const freshDict = spellcheckState.customDictionary;

                for (const word of misspelled) {
                    const wLower = word.toLowerCase();

                    if (freshDict.has(wLower)) continue;

                    // Double check possessive against fresh dict (race condition protection)
                    if (wLower.endsWith("'s")) {
                        const base = wLower.slice(0, -2);
                        if (freshDict.has(base)) continue;
                    }

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
                                    severity: 'error',
                                    message: `Misspelled: ${word}`,
                                    source: 'Spellchecker',
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
        },
        { delay: CONFIG.SPELLCHECK.LINT_DELAY_MS },
    );
};

export function triggerImmediateLint(view: EditorView) {
    forceLinting(view);
}

export async function refreshSpellcheck(view: EditorView | undefined) {
    if (!view) return;

    await refreshCustomDictionary();
    spellcheckState.misspelledCache = new Set<string>();
    triggerImmediateLint(view);
}

export const spellCheckKeymap = [
    {
        key: 'F8',
        run: (view: EditorView) => {
            const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
            let words: string[] = [];

            if (selection && selection.trim().length > 0) {
                words = selection.split(/\s+/).map((w) => w.replace(/[^a-zA-Z'-]/g, ''));
            } else {
                const range = view.state.wordAt(view.state.selection.main.head);
                if (range) {
                    words = [view.state.sliceDoc(range.from, range.to).replace(/[^a-zA-Z'-]/g, '')];
                }
            }

            if (words.length > 0) {
                // 1. Synchronous Optimistic Update
                // Update via re-assignment to trigger Svelte 5 signals
                const newDict = new Set(spellcheckState.customDictionary);
                words.forEach((w) => {
                    if (w && w.length > 1) {
                        newDict.add(w.toLowerCase());
                    }
                });
                spellcheckState.customDictionary = newDict;

                // 2. Clear cache
                words.forEach((w) => spellcheckState.misspelledCache.delete(w.toLowerCase()));

                // 3. Background Persistence
                Promise.all(words.map((w) => addToDictionary(w))).then(() => {
                    // Optional: Resync to ensure consistency with backend file
                    refreshCustomDictionary();
                });
            }
            return true;
        },
    },
];
