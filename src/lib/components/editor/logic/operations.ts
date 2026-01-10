import type { OperationId } from "$lib/config/textOperationsRegistry";
import type { ScrollManager } from "$lib/utils/cmScroll";
import { transformText } from "$lib/utils/textTransforms";
import type { EditorView } from "@codemirror/view";

export async function performTextOperation(
    view: EditorView,
    operationId: OperationId,
    scrollManager: ScrollManager,
    onStateChange?: (isTransforming: boolean) => void
) {
    if (!view) return;

    try {
        onStateChange?.(true);

        const selection = view.state.selection.main;
        const hasSelection = selection.from !== selection.to;
        const targetText = hasSelection
            ? view.state.sliceDoc(selection.from, selection.to)
            : view.state.doc.toString();

        // Capture scroll state before operation
        scrollManager.capture(view, `Op:${operationId}`);

        const newText = await transformText(targetText, operationId);

        if (newText !== targetText) {
            view.focus();

            const transaction: any = {
                changes: {
                    from: hasSelection ? selection.from : 0,
                    to: hasSelection ? selection.to : view.state.doc.length,
                    insert: newText,
                },
                userEvent: "input.complete",
                scrollIntoView: true,
            };

            // Restore selection logic
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

            // Restore scroll position for full-document transforms
            if (!hasSelection) {
                const snapshot = scrollManager.getSnapshot();
                const currentLines = view.state.doc.lines;
                let strategy: "anchor" | "pixel" = "pixel";

                if (operationId === "format-document") {
                    strategy = "anchor";
                } else if (snapshot && Math.abs(currentLines - snapshot.totalLines) > 0) {
                    strategy = "anchor";
                }
                scrollManager.restore(view, strategy);
            }
        }
    } catch (err) {
        console.error(`[Editor] Transformation error:`, err);
    } finally {
        // Small delay to allow UI to settle before re-enabling sync
        setTimeout(() => {
            onStateChange?.(false);
        }, 100);
    }
}
