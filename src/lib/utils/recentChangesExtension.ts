import { appState } from "$lib/stores/appState.svelte";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";

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

    eq(other: LineNumberMarker) {
        return this.lineNo === other.lineNo && Math.abs(this.alpha - other.alpha) < 0.01;
    }
}

/**
 * Creates the complete extension for recent changes:
 * 1. A ViewPlugin that updates the tracker state synchronously during view updates.
 * 2. The gutter that renders the line numbers based on that tracker state.
 */
export function createRecentChangesHighlighter(tracker: LineChangeTracker) {
    return [
        ViewPlugin.fromClass(class {
            update(update: ViewUpdate) {
                if (!update.docChanged) return;
                if (appState.recentChangesMode === 'disabled') return;

                // Detect Undo/Redo
                const isHistoryAction = update.transactions.some(tr =>
                    tr.isUserEvent('undo') || tr.isUserEvent('redo')
                );

                if (isHistoryAction) {
                    const affectedLines = new Set<number>();
                    update.changes.iterChanges((fromA, toA, fromB, toB) => {
                        const doc = update.state.doc;
                        const startLine = doc.lineAt(fromB).number;
                        const endLine = doc.lineAt(Math.min(toB, doc.length)).number;
                        for (let line = startLine; line <= endLine; line++) {
                            affectedLines.add(line);
                        }
                    });
                    tracker.removeLines(Array.from(affectedLines));
                    return;
                }

                // Only track user-initiated changes (typing, deleting, pasting, dragging)
                // This prevents programmatic changes (like file loading) from triggering highlights
                // "input" covers input.type, input.paste, input.drop, input.complete
                const isUserAction = update.transactions.some(tr =>
                    tr.isUserEvent('input') ||
                    tr.isUserEvent('delete') ||
                    tr.isUserEvent('move')
                );

                if (!isUserAction) return;

                // Normal Changes
                const changedLines = new Set<number>();
                update.changes.iterChanges((fromA, toA, fromB, toB) => {
                    const doc = update.state.doc;
                    const startLine = doc.lineAt(fromB).number;
                    const endLine = doc.lineAt(Math.min(toB, doc.length)).number;

                    for (let line = startLine; line <= endLine; line++) {
                        changedLines.add(line);
                    }

                    // Adjust subsequent line numbers if lines were added/removed
                    const lineDelta = (endLine - startLine) - (update.startState.doc.lineAt(toA).number - update.startState.doc.lineAt(fromA).number);
                    if (lineDelta !== 0) {
                        tracker.adjustLineNumbers(endLine + 1, lineDelta);
                    }
                });

                if (changedLines.size > 0) {
                    tracker.recordChanges(Array.from(changedLines));
                }
            }
        }),
        gutter({
            class: "cm-lineNumbers",
            lineMarker(view, line) {
                const lineNo = view.state.doc.lineAt(line.from).number;
                let alpha = 0;

                if (appState.recentChangesMode !== 'disabled') {
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
        })
    ];
}
