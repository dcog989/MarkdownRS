import { syntaxTree } from '@codemirror/language';
import { type Diagnostic, forceLinting, linter } from '@codemirror/lint';
import { StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { showToast } from '$lib/stores/toastStore.svelte';
import { callBackend } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { logger } from '$lib/utils/logger';
import { spellcheckState } from '$lib/utils/spellcheck.svelte.ts';
import type { AppEditorView } from '../../global';
import { docFingerprint, tabCache } from './spellcheckCache';

export const spellcheckRefreshEffect = StateEffect.define<null>();

export const createSpellCheckLinter = () => {
  return linter(
    async (view) => {
      if (!spellcheckState.dictionaryLoaded) {
        return [];
      }

      const { state } = view;
      const doc = state.doc;
      const docFp = docFingerprint(doc);

      const tabId = (view as AppEditorView)._currentTabId;

      if (tabId) {
        const cached = tabCache.get(tabId, docFp);
        if (cached) {
          spellcheckState.misspelledCache = new SvelteSet(cached.misspelledWords);
          return cached.diagnostics;
        }
      }

      const wordsToVerify = new SvelteMap<string, { from: number; to: number }[]>();

      const safeNodeTypes = new SvelteSet([
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

      const customDict = new SvelteSet(spellcheckState.customDictionary);

      syntaxTree(state).iterate({
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
            const wordRegex = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;
            let match: RegExpExecArray | null;

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
              if (wLower.endsWith("'s")) {
                const base = wLower.slice(0, -2);
                if (customDict.has(base)) continue;
                checkWord = word.slice(0, -2);
              }

              const ranges = wordsToVerify.get(checkWord) || [];
              ranges.push({ from: globalFrom, to: globalTo });
              wordsToVerify.set(checkWord, ranges);
            }
          }
        },
      });

      if (wordsToVerify.size === 0) {
        if (tabId) {
          tabCache.set(tabId, docFp, [], new SvelteSet());
        }
        return [];
      }

      try {
        const wordsArray = Array.from(wordsToVerify.keys());
        const misspelled = await callBackend(
          'check_words',
          {
            words: wordsArray,
          },
          'Editor:Init',
        );

        if (!misspelled) {
          if (tabId) {
            tabCache.set(tabId, docFp, [], new SvelteSet());
          }
          return [];
        }

        const newCache = new SvelteSet<string>();
        const diagnostics: Diagnostic[] = [];
        const diagnosticKeys = new SvelteSet<string>();

        const freshDict = spellcheckState.customDictionary;

        for (const word of misspelled) {
          const wLower = word.toLowerCase();

          if (freshDict.has(wLower)) continue;

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

        logger.spellcheck.debug('Diagnostics created', {
          diagnosticsCount: diagnostics.length,
          newCacheSize: newCache.size,
        });

        if (tabId) {
          tabCache.set(tabId, docFp, diagnostics, newCache);
        }

        return diagnostics;
      } catch (error) {
        logger.spellcheck.error('Linter error', { error: String(error) });
        if (!spellcheckState.linterFailedNotified) {
          spellcheckState.linterFailedNotified = true;
          showToast('warning', 'Spellcheck encountered an error — results may be incomplete');
        }
        return [];
      }
    },
    {
      delay: CONFIG.SPELLCHECK.LINT_DELAY_MS,
      needsRefresh: (update) => update.transactions.some((tx) => tx.effects.some((e) => e.is(spellcheckRefreshEffect))),
    },
  );
};

export function applyImmediateSpellcheck(view: EditorView) {
  view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
  forceLinting(view as never);
}

export function triggerImmediateLint(view: EditorView) {
  view.dispatch({ effects: spellcheckRefreshEffect.of(null) });
  forceLinting(view as never);
}
