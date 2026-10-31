import { type Diagnostic, forceLinting, linter } from "@codemirror/lint";
import { StateEffect } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { settingsState } from "$lib/stores/settingsState.svelte";
import { appContext } from "$lib/stores/state.svelte";
import type { LintDiagnostic } from "$lib/types/api";
import { callBackendSafe } from "$lib/utils/backend";
import { CONFIG } from "$lib/utils/config";
import { markdownLintState, resetMarkdownLintState } from "$lib/utils/markdownLint.svelte";
import type { AppEditorView } from "../../global";

const lintCache = new Map<string, { content: string; diagnostics: LintDiagnostic[] }>();
// A failing lint re-runs after every typing pause, so only the first failure of
// a streak is reported; the next success re-arms it.
let lintFailedNotified = false;
// Each entry holds a full copy of a document, so keep only recent tabs.
const MAX_LINT_CACHE_ENTRIES = 20;

function cacheLintResult(tabId: string, content: string, diagnostics: LintDiagnostic[]): void {
  lintCache.delete(tabId);
  lintCache.set(tabId, { content, diagnostics });
  if (lintCache.size > MAX_LINT_CACHE_ENTRIES) {
    const oldest = lintCache.keys().next().value;
    if (oldest !== undefined) lintCache.delete(oldest);
  }
}

export const markdownLintRefreshEffect = StateEffect.define<null>();

export function forceMarkdownRelint(view: EditorView) {
  const tabId = (view as AppEditorView)._currentTabId;
  if (tabId) lintCache.delete(tabId);
  view.dispatch({ effects: markdownLintRefreshEffect.of(null) });
  forceLinting(view);
}

// Backend linters report 1-based columns measured in Unicode scalar values,
// while CodeMirror works in UTF-16 code units. Translate so diagnostics on
// lines containing astral characters (e.g. emoji) stay aligned.
function columnToCodeUnits(text: string, column: number): number {
  let units = 0;
  let charsSeen = 0;
  for (const ch of text) {
    if (charsSeen >= column - 1) break;
    units += ch.length;
    charsSeen += 1;
  }
  return units;
}

function highestSeverity(diagnostics: { severity: string }[]): "error" | "warning" | "info" | "clean" {
  for (const d of diagnostics) {
    if (d.severity === "error") return "error";
  }
  for (const d of diagnostics) {
    if (d.severity === "warning") return "warning";
  }
  if (diagnostics.length > 0) return "info";
  return "clean";
}

function applyDiagnostics(view: EditorView, result: LintDiagnostic[]): Diagnostic[] {
  const tabId = (view as AppEditorView)._currentTabId;

  // The badge is window-wide, so only the focused tab may update it. A
  // background pane still gets its own editor markers.
  if (tabId !== undefined && tabId === appContext.app.activeTabId) {
    markdownLintState.diagnostics = result;
    markdownLintState.highestSeverity = highestSeverity(result);
    markdownLintState.issueCount = result.length;
  }

  const doc = view.state.doc;

  const diagnostics: Diagnostic[] = result.map((d) => {
    const startLine = doc.line(d.line);
    const endLine = doc.line(d.end_line);
    const from = startLine.from + columnToCodeUnits(startLine.text, d.column);
    const to = endLine.from + columnToCodeUnits(endLine.text, d.end_column);

    return {
      from,
      to,
      severity: "warning" as const,
      message: d.rule_name ? `${d.rule_name}: ${d.message}` : d.message,
      source: d.source,
    };
  });

  return diagnostics;
}

/** Point the badge at the focused tab: reuse its cached result while it still
 *  matches the buffer, otherwise clear until the linter runs. */
export function syncLintStateForTab(tabId: string | null): void {
  if (!tabId) {
    resetMarkdownLintState();
    return;
  }

  const tab = appContext.editor.tabs.find((t) => t.id === tabId);
  const cached = lintCache.get(tabId);
  if (!tab || !cached || cached.content !== tab.content) {
    resetMarkdownLintState();
    return;
  }

  markdownLintState.diagnostics = cached.diagnostics;
  markdownLintState.issueCount = cached.diagnostics.length;
  markdownLintState.highestSeverity = highestSeverity(cached.diagnostics);
}

export const createMarkdownLinter = () => {
  return linter(
    async (view) => {
      const tabId = (view as AppEditorView)._currentTabId;
      if (!tabId) return [];

      const doc = view.state.doc;
      const content = doc.sliceString(0);

      const cached = lintCache.get(tabId);
      if (cached && cached.content === content) {
        return applyDiagnostics(view, cached.diagnostics);
      }

      const tab = appContext.editor.tabs.find((t) => t.id === tabId);
      const filePath = tab?.path ?? undefined;

      const result = await callBackendSafe(
        "lint_markdown",
        {
          content,
          filePath,
          harperEnabled: settingsState.harperEnabled,
          harperLinters: settingsState.harperLinters,
        },
        "Markdown:Lint",
        { showToast: !lintFailedNotified },
      );
      lintFailedNotified = result === null;

      // The document may have changed while awaiting the backend (tab switch,
      // sync), so the line numbers in the result no longer apply. Discard the
      // stale result; the linter re-runs for the new content on the next
      // docChanged refresh. Doc identity changes on every edit, making this
      // an O(1) staleness check.
      if (view.state.doc !== doc) {
        return [];
      }

      if (!result) {
        cacheLintResult(tabId, content, []);
        if (tabId === appContext.app.activeTabId) resetMarkdownLintState();
        return [];
      }

      cacheLintResult(tabId, content, result);

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
