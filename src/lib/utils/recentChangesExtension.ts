import { appState } from "$lib/stores/appState.svelte";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { GutterMarker, gutter } from "@codemirror/view";
import { RangeSet } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";

class RecentChangeMarker extends GutterMarker {
    constructor(private alpha: number) {
        super();
    }

    toDOM() {
        const marker = document.createElement("div");
        marker.style.color = `rgba(76, 175, 80, ${this.alpha})`;
        marker.style.fontWeight = "bold";
        return marker;
    }
}

/**
 * CodeMirror extension to highlight recently changed lines
 */
export function createRecentChangesHighlighter(tracker: LineChangeTracker) {
    return gutter({
        class: "cm-recent-changes-gutter",
        markers: (view) => {
            if (!appState.highlightRecentChanges) {
                return RangeSet.empty;
            }

            const markers: Array<{ from: number; to: number; value: GutterMarker }> = [];
            const doc = view.state.doc;

            const highlightedLines = tracker.getHighlightedLines(
                appState.recentChangesMode,
                appState.recentChangesTimespan,
                appState.recentChangesCount
            );

            // Apply markers to highlighted lines
            for (const [lineNumber, alpha] of highlightedLines) {
                if (lineNumber < 1 || lineNumber > doc.lines) continue;

                try {
                    const line = doc.line(lineNumber);
                    markers.push({
                        from: line.from,
                        to: line.from,
                        value: new RecentChangeMarker(alpha),
                    });
                } catch (e) {
                    // Line number out of bounds, skip
                    continue;
                }
            }

            return RangeSet.of(markers, true);
        },
        lineMarker: (view, line) => {
            if (!appState.highlightRecentChanges) return null;

            const lineNumber = view.state.doc.lineAt(line.from).number;
            const highlightedLines = tracker.getHighlightedLines(
                appState.recentChangesMode,
                appState.recentChangesTimespan,
                appState.recentChangesCount
            );

            const alpha = highlightedLines.get(lineNumber);
            if (alpha && alpha > 0) {
                return new RecentChangeMarker(alpha);
            }
            return null;
        },
    });
}

/**
 * Track changes from editor updates
 */
export function trackEditorChanges(tracker: LineChangeTracker, update: ViewUpdate) {
    if (!appState.highlightRecentChanges) return;
    if (!update.docChanged) return;

    const changedLines = new Set<number>();

    for (const transaction of update.transactions) {
        if (!transaction.docChanged) continue;

        transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
            const doc = update.state.doc;

            // Calculate which lines were affected
            const startLine = doc.lineAt(fromB).number;
            const endLine = doc.lineAt(Math.min(toB, doc.length)).number;

            for (let line = startLine; line <= endLine; line++) {
                changedLines.add(line);
            }

            // Handle line insertions/deletions
            const oldLineCount = update.startState.doc.lineAt(toA).number - update.startState.doc.lineAt(fromA).number + 1;
            const newLineCount = endLine - startLine + 1;
            const lineDelta = newLineCount - oldLineCount;

            if (lineDelta !== 0) {
                // Adjust line numbers for lines after the change
                tracker.adjustLineNumbers(endLine + 1, lineDelta);
            }
        });
    }

    if (changedLines.size > 0) {
        tracker.recordChanges(Array.from(changedLines));
    }
}
