import { syntaxTree } from "@codemirror/language";
import { type Diagnostic, forceLinting, linter } from "@codemirror/lint";
import { StateEffect } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { translate } from "$lib/i18n";
import { showToast } from "$lib/stores/toastStore.svelte";
import { callBackend } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { logger } from "$lib/utils/logger";
import { spellcheckState, stripPossessiveSuffix } from "$lib/utils/spellcheck.svelte";

export const spellcheckRefreshEffect = StateEffect.define<null>();

export const createSpellCheckLinter = () => {
  return linter(
    async (view) => {
      if (!spellcheckState.dictionaryLoaded) {
        return [];
      }

      const { state } = view;
      const doc = state.doc;

      const wordsToVerify = new Map<string, { from: number; to: number }[]>();
      const diagnostics: Diagnostic[] = [];
      const diagnosticKeys = new Set<string>();

      // Only nodes that directly hold raw text. Containers such as ListItem,
      // Blockquote or Emphasis would re-scan the same words once per nesting
      // level, and this parser has no "Text" node at all.
      const textContainers = new Set([
        "Paragraph",
        "Task",
        "TableCell",
        "ATXHeading1",
        "ATXHeading2",
        "ATXHeading3",
        "ATXHeading4",
        "ATXHeading5",
        "ATXHeading6",
        "SetextHeading1",
        "SetextHeading2",
      ]);

      const customDict = spellcheckState.customDictionary;
      const validCache = spellcheckState.validCache;
      const misspelledCache = spellcheckState.misspelledCache;

      const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;

      // Text containers span inline code and links, so the excluded ranges must
      // be known before scanning them.
      const excludedRanges: { from: number; to: number }[] = [];
      syntaxTree(state).iterate({
        from: view.viewport.from,
        to: view.viewport.to,
        enter: (node: SyntaxNodeRef): boolean | undefined => {
          if (
            node.name.includes("Code") ||
            node.name === "URL" ||
            node.name === "Autolink" ||
            node.name.includes("Comment") ||
            node.name.includes("Attribute") ||
            node.name === "HtmlTag"
          ) {
            excludedRanges.push({ from: node.from, to: node.to });
            return false;
          }
        },
      });

      syntaxTree(state).iterate({
        from: view.viewport.from,
        to: view.viewport.to,
        enter: (node: SyntaxNodeRef): void => {
          if (textContainers.has(node.name)) {
            const nodeText = doc.sliceString(node.from, node.to);
            let match: RegExpExecArray | null;

            wordRegex.lastIndex = 0;

            while (true) {
              match = wordRegex.exec(nodeText);
              if (match === null) break;

              const word = match[0];
              if (word.length <= 1) continue;
              if (/[a-z][A-Z]/.test(word)) continue;

              // The backend checks case-sensitively (e.g. "Firefox" is valid but
              // "firefox" is not), so valid/misspelled caches must preserve case.
              const checkWord = stripPossessiveSuffix(word);
              if (customDict.has(word.toLowerCase()) || customDict.has(checkWord.toLowerCase())) continue;
              if (validCache.has(checkWord)) continue;

              const globalFrom = node.from + match.index;
              const globalTo = globalFrom + word.length;

              if (excludedRanges.some((range) => globalFrom < range.to && globalTo > range.from)) continue;

              // Only uncached candidates pay for the two adjacent-character reads.
              const charBefore = globalFrom > 0 ? doc.sliceString(globalFrom - 1, globalFrom) : "";
              const charAfter = globalTo < doc.length ? doc.sliceString(globalTo, globalTo + 1) : "";
              if (/[\\/:@.~]/.test(charBefore) || /[\\/:@]/.test(charAfter)) continue;

              if (misspelledCache.has(checkWord)) {
                const key = `${globalFrom}-${globalTo}`;
                if (!diagnosticKeys.has(key)) {
                  diagnosticKeys.add(key);
                  diagnostics.push({
                    from: globalFrom,
                    to: globalTo,
                    severity: "error",
                    message: translate("editor.misspelled", { values: { word: checkWord } }),
                    source: "Spellchecker",
                  });
                }
                continue;
              }

              const ranges = wordsToVerify.get(checkWord) || [];
              ranges.push({ from: globalFrom, to: globalTo });
              wordsToVerify.set(checkWord, ranges);
            }
          }
        },
      });

      if (wordsToVerify.size > 0) {
        try {
          const wordsArray = Array.from(wordsToVerify.keys());
          const misspelled = await callBackend("check_words", { words: wordsArray }, "Editor:Init");

          if (misspelled) {
            const misspelledSet = new Set(misspelled);

            for (const word of wordsArray) {
              if (misspelledSet.has(word)) {
                misspelledCache.add(word);

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
                        message: translate("editor.misspelled", { values: { word } }),
                        source: "Spellchecker",
                      });
                    }
                  }
                }
              } else {
                spellcheckState.addValidWord(word);
              }
            }
          }
        } catch (error) {
          logger.spellcheck.error("Linter error", { error: String(error) });
          if (!spellcheckState.linterFailedNotified) {
            spellcheckState.linterFailedNotified = true;
            showToast("warning", translate("editor.spellcheckError"));
          }
        }
      }

      // The document may have changed while awaiting the backend (tab
      // switch, sync), which invalidates every position computed against
      // the snapshot above. Discard the result; the linter re-runs for the
      // new content on the next docChanged refresh.
      if (view.state.doc !== doc) {
        return [];
      }

      return diagnostics;
    },
    {
      delay: CONFIG.SPELLCHECK.LINT_DELAY_MS,
      needsRefresh: (update) =>
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tx) => tx.effects.some((e) => e.is(spellcheckRefreshEffect))),
    },
  );
};

export function applyImmediateSpellcheck(view: EditorView) {
  view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
  forceLinting(view);
}

export function triggerImmediateLint(view: EditorView) {
  view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
  forceLinting(view);
}
