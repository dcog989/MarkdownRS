import { syntaxTree } from '@codemirror/language';
import { type Diagnostic, forceLinting, linter } from '@codemirror/lint';
import { StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { translate } from '$lib/i18n';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { logger } from '$lib/utils/logger';
import { spellcheckState } from '$lib/utils/spellcheck.svelte';

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

      const customDict = spellcheckState.customDictionary;
      const validCache = spellcheckState.validCache;
      const misspelledCache = spellcheckState.misspelledCache;

      const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;

      syntaxTree(state).iterate({
        from: view.viewport.from,
        to: view.viewport.to,
        enter: (node: SyntaxNodeRef): boolean | undefined => {
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
            let match: RegExpExecArray | null;

            wordRegex.lastIndex = 0;

            while (true) {
              match = wordRegex.exec(nodeText);
              if (match === null) break;

              const word = match[0];
              if (word.length <= 1) continue;

              const globalFrom = node.from + match.index;
              const globalTo = globalFrom + word.length;

              const charBefore = globalFrom > 0 ? doc.sliceString(globalFrom - 1, globalFrom) : '';
              const charAfter = globalTo < doc.length ? doc.sliceString(globalTo, globalTo + 1) : '';
              if (/[\\/:@.~]/.test(charBefore) || /[\\/:@]/.test(charAfter)) continue;

              if (/\d/.test(word) || /[a-z][A-Z]/.test(word)) continue;

              const wLower = word.toLowerCase();

              if (customDict.has(wLower)) continue;

              let checkWord = word;
              let checkLower = wLower;

              if (wLower.endsWith("'s")) {
                const base = wLower.slice(0, -2);
                if (customDict.has(base)) continue;
                checkWord = word.slice(0, -2);
                checkLower = base;
              }

              if (validCache.has(checkLower)) {
                continue;
              }

              if (misspelledCache.has(checkLower)) {
                const key = `${globalFrom}-${globalTo}`;
                if (!diagnosticKeys.has(key)) {
                  diagnosticKeys.add(key);
                  diagnostics.push({
                    from: globalFrom,
                    to: globalTo,
                    severity: 'error',
                    message: translate('editor.misspelled', { values: { word: checkWord } }),
                    source: 'Spellchecker',
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
          const misspelled = await callBackend('check_words', { words: wordsArray }, 'Editor:Init');

          if (misspelled) {
            const misspelledSet = new Set(misspelled.map((w: string) => w.toLowerCase()));

            for (const word of wordsArray) {
              const wLower = word.toLowerCase();
              const baseLower = wLower.endsWith("'s") ? wLower.slice(0, -2) : wLower;

              if (misspelledSet.has(wLower)) {
                misspelledCache.add(baseLower);

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
                        message: translate('editor.misspelled', { values: { word } }),
                        source: 'Spellchecker',
                      });
                    }
                  }
                }
              } else {
                spellcheckState.addValidWord(baseLower);
              }
            }
          }
        } catch (error) {
          logger.spellcheck.error('Linter error', { error: String(error) });
          if (!spellcheckState.linterFailedNotified) {
            spellcheckState.linterFailedNotified = true;
            showToast('warning', translate('editor.spellcheckError'));
          }
        }
      }

      return diagnostics;
    },
    {
      delay: CONFIG.SPELLCHECK.LINT_DELAY_MS,
      needsRefresh: (update) =>
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
