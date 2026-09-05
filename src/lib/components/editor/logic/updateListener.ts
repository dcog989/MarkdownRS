import { EditorView } from "@codemirror/view";
import type { EditorMetrics } from "$lib/stores/editorMetrics.svelte";
import { CONFIG } from "$lib/utils/config";
import { calculateCursorMetrics } from "$lib/utils/textMetrics";

export function createUpdateListener(
  getCurrentTabId: () => string | undefined,
  onContentChange: (content: string, lineCount: number) => void,
  onMetricsChange: (metrics: Partial<EditorMetrics>) => void,
  timers: { content: number | null; metrics: number | null },
  onSelectionChange?: (anchor: number, head: number) => void,
  onHistoryUpdate?: (state: unknown) => void,
  getHistoryState?: () => unknown | undefined,
) {
  // Cursor and metrics are both derived from the selection position and share
  // the same debounce window, so they are coalesced into a single timer.
  // The content timer stays separate: tabSync uses its pending state as the
  // "unsaved content" signal for flush/switch saves.
  let selectionPending = false;

  const schedulePositionUpdate = (view: EditorView, selectionChanged: boolean) => {
    selectionPending = selectionPending || selectionChanged;
    if (timers.metrics) clearTimeout(timers.metrics);
    timers.metrics = window.setTimeout(() => {
      timers.metrics = null;
      const state = view.state;
      if (selectionPending && onSelectionChange) {
        selectionPending = false;
        const sel = state.selection.main;
        onSelectionChange(sel.anchor, sel.head);
      }
      const line = state.doc.lineAt(state.selection.main.head);
      onMetricsChange(
        calculateCursorMetrics(state.doc, state.selection.main.head, {
          number: line.number,
          from: line.from,
          text: line.text,
        }),
      );
    }, CONFIG.EDITOR.METRICS_DEBOUNCE_MS);
  };

  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      if (timers.content) clearTimeout(timers.content);
      const currentTabId = getCurrentTabId();
      const docLines = update.state.doc.lines;
      timers.content = window.setTimeout(() => {
        timers.content = null;
        if (getCurrentTabId() === currentTabId && currentTabId !== undefined) {
          onContentChange(update.state.doc.toString(), docLines);
          if (onHistoryUpdate && getHistoryState) {
            onHistoryUpdate(getHistoryState());
          }
        }
      }, CONFIG.EDITOR.CONTENT_DEBOUNCE_MS);
    }
    if (update.docChanged || update.selectionSet) {
      schedulePositionUpdate(update.view, update.selectionSet && onSelectionChange !== undefined);
    }
  });
}
