import { appState } from "$lib/stores/appState.svelte";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import type { ViewUpdate } from "@codemirror/view";
import { GutterMarker, gutter } from "@codemirror/view";

class LineNumberMarker extends GutterMarker {
    constructor(private lineNo: number, private alpha: number) {
        super();
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = String(this.lineNo);

        span.style.color = "var(--color-fg-muted)";

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
 * Custom line number gutter that integrates recent change highlighting
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
        initialSpacer: () => new LineNumberMarker(1, 0),
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
