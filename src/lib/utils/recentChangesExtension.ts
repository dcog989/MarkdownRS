import { appState } from "$lib/stores/appState.svelte";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { EditorView, GutterMarker, gutter, type ViewUpdate } from "@codemirror/view";

class LineNumberMarker extends GutterMarker {
    constructor(private lineNo: number, private alpha: number) {
        super();
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = String(this.lineNo);

        if (this.alpha > 0) {
            span.style.color = `color-mix(in srgb, var(--color-highlight-line), var(--color-fg-muted) ${Math.round((1 - this.alpha) * 100)}%)`;
            span.style.fontWeight = "bold";

            const shadowAlpha = Math.round(this.alpha * 40);
            span.style.textShadow = `0 0 4px color-mix(in srgb, var(--color-highlight-line), transparent ${100 - shadowAlpha}%)`;
        }

        return span;
    }
}

/**
 * Custom line number gutter that integrates recent change highlighting.
 * Uses initialSpacer and updateSpacer to ensure the gutter is always wide enough
 * for the largest line number in the document.
 */
export function createRecentChangesHighlighter(tracker: LineChangeTracker) {
    return gutter({
        class: "cm-lineNumbers",
        lineMarker(view, line) {
            const lineNo = view.state.doc.lineAt(line.from).number;
            let alpha = 0;

            if (appState.highlightRecentChanges) {
                alpha = tracker.getLineAlpha(
                    lineNo,
                    appState.recentChangesMode,
                    appState.recentChangesTimespan,
                    appState.recentChangesCount
                );
            }

            return new LineNumberMarker(lineNo, alpha);
        },
        initialSpacer: (view: EditorView) => new LineNumberMarker(view.state.doc.lines, 0),
        updateSpacer: (spacer: GutterMarker, update: ViewUpdate) => {
            if (update.docChanged) {
                return new LineNumberMarker(update.state.doc.lines, 0);
            }
            return spacer;
        }
    });
}

/**
 * Track changes from editor updates
 */
export function trackEditorChanges(tracker: LineChangeTracker, update: ViewUpdate) {
    if (!update.docChanged) return;

    const changedLines = new Set<number>();

    update.changes.iterChanges((fromA, toA, fromB, toB) => {
        const doc = update.state.doc;
        const startLine = doc.lineAt(fromB).number;
        const endLine = doc.lineAt(Math.min(toB, doc.length)).number;

        for (let line = startLine; line <= endLine; line++) {
            changedLines.add(line);
        }

        // Adjust tracker for line count changes
        const lineDelta = (endLine - startLine) - (update.startState.doc.lineAt(toA).number - update.startState.doc.lineAt(fromA).number);
        if (lineDelta !== 0) {
            tracker.adjustLineNumbers(endLine + 1, lineDelta);
        }
    });

    if (changedLines.size > 0 && appState.highlightRecentChanges) {
        tracker.recordChanges(Array.from(changedLines));
    }
}
