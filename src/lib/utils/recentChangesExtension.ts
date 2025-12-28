import { appContext } from "$lib/stores/state.svelte.ts";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";

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

export function createRecentChangesHighlighter(tracker: LineChangeTracker) {
    return [
        ViewPlugin.fromClass(class {
            update(update: ViewUpdate) {
                if (!update.docChanged) return;
                if (appContext.app.recentChangesMode === 'disabled') return;

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

                const isUserAction = update.transactions.some(tr =>
                    tr.isUserEvent('input') ||
                    tr.isUserEvent('delete') ||
                    tr.isUserEvent('move')
                );

                if (!isUserAction) return;

                const changedLines = new Set<number>();
                update.changes.iterChanges((fromA, toA, fromB, toB) => {
                    const doc = update.state.doc;
                    const startLine = doc.lineAt(fromB).number;
                    const endLine = doc.lineAt(Math.min(toB, doc.length)).number;

                    for (let line = startLine; line <= endLine; line++) {
                        changedLines.add(line);
                    }

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

                if (appContext.app.recentChangesMode !== 'disabled') {
                    alpha = tracker.getLineAlpha(
                        lineNo,
                        appContext.app.recentChangesMode,
                        appContext.app.recentChangesTimespan,
                        appContext.app.recentChangesCount
                    );
                }

                return new LineNumberMarker(lineNo, alpha);
            },
            initialSpacer: (view) => new LineNumberMarker(view.state.doc.lines, 0),
            updateSpacer: (spacer, update) => {
                if (update.docChanged) {
                    return new LineNumberMarker(update.state.doc.lines, 0);
                }
                return spacer;
            }
        })
    ];
}
