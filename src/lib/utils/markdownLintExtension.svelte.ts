import { type Diagnostic, linter } from '@codemirror/lint';
import { appContext } from '$lib/stores/state.svelte.ts';
import { callBackendSafe } from '$lib/utils/backend';
import { CONFIG } from '$lib/utils/config';
import { markdownLintState } from '$lib/utils/markdownLint.svelte.ts';
import type { AppEditorView } from '../../global';

function highestSeverity(diagnostics: Diagnostic[]): 'error' | 'warning' | 'info' | 'clean' {
  for (const d of diagnostics) {
    if (d.severity === 'error') return 'error';
  }
  for (const d of diagnostics) {
    if (d.severity === 'warning') return 'warning';
  }
  if (diagnostics.length > 0) return 'info';
  return 'clean';
}

function lineColToOffset(doc: string, line: number, column: number): number {
  let pos = 0;
  let currentLine = 1;
  for (const ch of doc) {
    if (currentLine === line) {
      return pos + column - 1;
    }
    if (ch === '\n') currentLine += 1;
    pos += 1;
  }
  return doc.length;
}

export const createMarkdownLinter = () => {
  return linter(
    async (view) => {
      const tabId = (view as AppEditorView)._currentTabId;
      if (!tabId) return [];

      const content = view.state.doc.sliceString(0);
      const tab = appContext.editor.tabs.find((t) => t.id === tabId);
      const filePath = tab?.path ?? undefined;

      const result = await callBackendSafe('lint_markdown', { content, filePath }, 'Markdown:Lint');
      if (!result) {
        markdownLintState.issueCount = 0;
        markdownLintState.highestSeverity = 'clean';
        markdownLintState.diagnostics = [];
        return [];
      }

      markdownLintState.diagnostics = result;

      const diagnostics: Diagnostic[] = result.map((d) => ({
        from: lineColToOffset(content, d.line, d.column),
        to: lineColToOffset(content, d.end_line, d.end_column),
        severity: d.severity as 'error' | 'warning' | 'info',
        message: d.rule_name ? `${d.rule_name}: ${d.message}` : d.message,
        source: 'rumdl',
      }));

      markdownLintState.issueCount = diagnostics.length;
      markdownLintState.highestSeverity = highestSeverity(diagnostics);

      return diagnostics;
    },
    { delay: CONFIG.MARKDOWN_LINT.LINT_DELAY_MS },
  );
};
