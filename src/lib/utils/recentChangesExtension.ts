import { appContext } from "$lib/stores/state.svelte.ts";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";
import { gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";

class LineNumberMarker extends GutterMarker {
    constructor(private lineNo: number, private alpha: number, private deletionAlpha: number) {
        super();
    }

    toDOM() {
        const span = document.createElement("span");
        span.textContent = String(this.lineNo);
        span.style.position = "relative";
        span.style.display = "block";

        if (this.alpha > 0) {
            span.style.color = `color-mix(in srgb, var(--color-highlight-line), var(--color-fg-muted) ${Math.round((1 - this.alpha) * 100)}%)`;
            span.style.fontWeight = "bold";

            const shadowAlpha = Math.round(this.alpha * 40);
            span.style.textShadow = `0 0 4px color-mix(in srgb, var(--color-highlight-line), transparent ${100 - shadowAlpha}%)`;
        }

        if (this.deletionAlpha > 0) {
            const delMarker = document.createElement("div");
            delMarker.style.position = "absolute";
            delMarker.style.bottom = "-2px";
            delMarker.style.left = "0";
            delMarker.style.right = "0";
            delMarker.style.height = "2px";
            delMarker.style.backgroundColor = `color-mix(in srgb, var(--color-danger), transparent ${Math.round((1 - this.deletionAlpha) * 100)}%)`;
            delMarker.style.pointerEvents = "none";
            // Ensure marker is visible above other elements
            delMarker.style.zIndex = "10";
            span.appendChild(delMarker);
        }

        return span;
    }

    eq(other: LineNumberMarker) {
        return this.lineNo === other.lineNo &&
            Math.abs(this.alpha - other.alpha) < 0.01 &&
            Math.abs(this.deletionAlpha - other.deletionAlpha) < 0.01;
    }
}

export function createRecentChangesHighlighter(tracker: LineChangeTracker) {
    return [
        ViewPlugin.fromClass(class {
            update(update: ViewUpdate) {
                if (!update.docChanged) return;
                // Disabled if both count and timespan are 0
                if (appContext.app.recentChangesCount === 0 && appContext.app.recentChangesTimespan === 0) return;

                const isHistoryAction = update.transactions.some(tr =>
                    tr.isUserEvent('undo') || tr.isUserEvent('redo')
                );

                if (isHistoryAction) {
                    // For undo/redo, simpler to just clear invalid trackers or ideally reconstruct from history
                    // For now, simple clear of affected areas to avoid ghosts
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
                const deletions = new Set<number>();

                update.changes.iterChanges((fromA, toA, fromB, toB) => {
                    const docA = update.startState.doc;
                    const docB = update.state.doc;

                    const linesA = docA.lineAt(toA).number - docA.lineAt(fromA).number;
                    const linesB = docB.lineAt(toB).number - docB.lineAt(fromB).number;

                    // Deletion Logic
                    if (linesA > linesB) {
                        // Mark the line where the deletion collapsed to
                        const lineNo = docB.lineAt(fromB).number;
                        // Determine visual position:
                        // If we deleted text at end of line 5 (merging line 6 into 5), line 5 remains.
                        // The 'gap' is roughly after line 5.
                        // If we deleted line 1 entirely, content shifts up.
                        deletions.add(lineNo);
                    }

                    // Modification Logic
                    const startLine = docB.lineAt(fromB).number;
                    const endLine = docB.lineAt(Math.min(toB, docB.length)).number;

                    for (let line = startLine; line <= endLine; line++) {
                        changedLines.add(line);
                    }

                    // Adjust markers for shifting lines
                    const lineDelta = linesB - linesA;
                    if (lineDelta !== 0) {
                        // We pass the line *after* the change range for adjustment
                        tracker.adjustLineNumbers(endLine + 1, lineDelta);
                    }
                });

                if (changedLines.size > 0) {
                    tracker.recordChanges(Array.from(changedLines));
                }

                if (deletions.size > 0) {
                    deletions.forEach(line => tracker.recordDeletion(line));
                }
            }
        }),
        gutter({
            class: "cm-lineNumbers",
            lineMarker(view, line) {
                const lineNo = view.state.doc.lineAt(line.from).number;
                let alpha = 0;
                let deletionAlpha = 0;

                // Calculate alpha if either mode is enabled
                if (appContext.app.recentChangesCount > 0 || appContext.app.recentChangesTimespan > 0) {
                    alpha = tracker.getLineAlpha(
                        lineNo,
                        appContext.app.recentChangesTimespan,
                        appContext.app.recentChangesCount
                    );

                    deletionAlpha = tracker.getDeletionAlpha(
                        lineNo,
                        appContext.app.recentChangesTimespan,
                        appContext.app.recentChangesCount
                    );
                }

                return new LineNumberMarker(lineNo, alpha, deletionAlpha);
            },
            initialSpacer: (view) => new LineNumberMarker(view.state.doc.lines, 0, 0),
            updateSpacer: (spacer, update) => {
                if (update.docChanged) {
                    return new LineNumberMarker(update.state.doc.lines, 0, 0);
                }
                return spacer;
            }
        })
    ];
}
