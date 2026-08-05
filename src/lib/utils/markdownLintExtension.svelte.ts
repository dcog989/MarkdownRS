import { type Diagnostic, forceLinting, linter } from '@codemirror/lint';
import { StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { appContext } from '$lib/stores/state.svelte';
import type { LintDiagnostic } from '$lib/types/api';
import { callBackendSafe } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { markdownLintState } from '$lib/utils/markdownLint.svelte';
import type { AppEditorView } from '../../global';

const lintCache = new Map<string, { content: string; diagnostics: LintDiagnostic[] }>();

export const markdownLintRefreshEffect = StateEffect.define<null>();

export function forceMarkdownRelint(view: EditorView) {
  const tabId = (view as AppEditorView)._currentTabId;
  if (tabId) lintCache.delete(tabId);
  view.dispatch({ effects: markdownLintRefreshEffect.of(null) });
  forceLinting(view);
}

function highestSeverity(diagnostics: { severity: string }[]): 'error' | 'warning' | 'info' | 'clean' {
  for (const d of diagnostics) {
    if (d.severity === 'error') return 'error';
  }
  for (const d of diagnostics) {
    if (d.severity === 'warning') return 'warning';
  }
  if (diagnostics.length > 0) return 'info';
  return 'clean';
}

function applyDiagnostics(view: EditorView, result: LintDiagnostic[]): Diagnostic[] {
  markdownLintState.diagnostics = result;

  const doc = view.state.doc;
  markdownLintState.highestSeverity = highestSeverity(result);

  const diagnostics: Diagnostic[] = result.map((d) => ({
    from: doc.line(d.line).from + d.column - 1,
    to: doc.line(d.end_line).from + d.end_column - 1,
    severity: 'warning' as const,
    message: d.rule_name ? `${d.rule_name}: ${d.message}` : d.message,
    source: 'rumdl',
  }));

  markdownLintState.issueCount = diagnostics.length;

  return diagnostics;
}

export const createMarkdownLinter = () => {
  return linter(
    async (view) => {
      const tabId = (view as AppEditorView)._currentTabId;
      if (!tabId) return [];

      const content = view.state.doc.sliceString(0);

      const cached = lintCache.get(tabId);
      if (cached && cached.content === content) {
        return applyDiagnostics(view, cached.diagnostics);
      }

      const tab = appContext.editor.tabs.find((t) => t.id === tabId);
      const filePath = tab?.path ?? undefined;

      const result = await callBackendSafe('lint_markdown', { content, filePath }, 'Markdown:Lint');
      if (!result) {
        lintCache.set(tabId, { content, diagnostics: [] });
        markdownLintState.issueCount = 0;
        markdownLintState.highestSeverity = 'clean';
        markdownLintState.diagnostics = [];
        return [];
      }

      lintCache.set(tabId, { content, diagnostics: result });

      return applyDiagnostics(view, result);
    },
    {
      delay: CONFIG.MARKDOWN_LINT.LINT_DELAY_MS,
      needsRefresh: (update) =>
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tx) => tx.effects.some((e) => e.is(markdownLintRefreshEffect))),
    },
  );
};
