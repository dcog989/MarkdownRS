import { EditorView } from '@codemirror/view';
import type { EditorMetrics } from '$lib/stores/editorMetrics.svelte';
import { CONFIG } from '$lib/utils/config';
import { calculateCursorMetrics } from '$lib/utils/textMetrics';

export function createUpdateListener(
  getCurrentTabId: () => string | undefined,
  onContentChange: (content: string, lineCount: number) => void,
  onMetricsChange: (metrics: Partial<EditorMetrics>) => void,
  timers: { content: number | null; metrics: number | null; cursor: number | null },
  onSelectionChange?: (anchor: number, head: number) => void,
  onHistoryUpdate?: (state: unknown) => void,
  getHistoryState?: () => unknown | undefined,
) {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      if (timers.content) clearTimeout(timers.content);
      const currentTabId = getCurrentTabId();
      const docLines = update.state.doc.lines;
      timers.content = window.setTimeout(() => {
        if (getCurrentTabId() === currentTabId && currentTabId !== undefined) {
          onContentChange(update.state.doc.toString(), docLines);
          if (onHistoryUpdate && getHistoryState) {
            onHistoryUpdate(getHistoryState());
          }
        }
      }, CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);
    }
    if (update.selectionSet) {
      if (onSelectionChange) {
        if (timers.cursor) clearTimeout(timers.cursor);
        timers.cursor = window.setTimeout(() => {
          timers.cursor = null;
          const sel = update.view.state.selection.main;
          onSelectionChange(sel.anchor, sel.head);
        }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
      }
    }
    if (update.docChanged || update.selectionSet) {
      if (timers.metrics) clearTimeout(timers.metrics);
      timers.metrics = window.setTimeout(() => {
        const state = update.view.state;
        const line = state.doc.lineAt(state.selection.main.head);

        onMetricsChange(
          calculateCursorMetrics(state.doc, state.selection.main.head, {
            number: line.number,
            from: line.from,
            text: line.text,
          }),
        );
      }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
    }
  });
}
