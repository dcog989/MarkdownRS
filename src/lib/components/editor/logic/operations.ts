import type { TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { OperationId } from "$lib/config/textOperationsRegistry";
import { textProcessor } from "$lib/services/textProcessor";
import { AppError } from "$lib/utils/errorHandling";

const STATE_CHANGE_DELAY_MS = 100;

export async function performTextOperation(
  view: EditorView,
  operationId: OperationId,
  onStateChange?: (isTransforming: boolean) => void,
) {
  if (!view) return;

  try {
    onStateChange?.(true);

    const selection = view.state.selection.main;
    const hasSelection = selection.from !== selection.to;
    const targetText = hasSelection ? view.state.sliceDoc(selection.from, selection.to) : view.state.doc.toString();

    const newText = await textProcessor.process(operationId, targetText);

    if (newText !== targetText) {
      view.focus();

      const userEvent = operationId === "format-document" ? "format" : "input.complete";

      const transaction: TransactionSpec = {
        changes: {
          from: hasSelection ? selection.from : 0,
          to: hasSelection ? selection.to : view.state.doc.length,
          insert: newText,
        },
        userEvent: userEvent,
        scrollIntoView: true,
      };

      if (hasSelection) {
        transaction.selection = {
          anchor: selection.from,
          head: selection.from + newText.length,
        };
      } else {
        const newLen = newText.length;
        transaction.selection = {
          anchor: Math.min(selection.anchor, newLen),
          head: Math.min(selection.head, newLen),
        };
      }

      view.dispatch(transaction);
    }
  } catch (err) {
    AppError.handle("Transform:Text", err, {
      showToast: true,
      additionalInfo: { operationId },
    });
  } finally {
    setTimeout(() => {
      onStateChange?.(false);
    }, STATE_CHANGE_DELAY_MS);
  }
}
