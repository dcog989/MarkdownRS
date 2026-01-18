import { appContext } from '$lib/stores/state.svelte.ts';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';
import { gutter, GutterMarker, lineNumbers, ViewPlugin, type ViewUpdate } from '@codemirror/view';

class LineNumberMarker extends GutterMarker {
    constructor(
        private lineNo: number,
        private alpha: number,
        private deletionAlpha: number,
    ) {
        super();
    }

    toDOM() {
        const span = document.createElement('span');
        span.textContent = String(this.lineNo);
        span.style.position = 'relative';
        span.style.display = 'block';

        if (this.alpha > 0) {
            span.style.color = `color-mix(in srgb, var(--color-highlight-line), var(--color-fg-muted) ${Math.round((1 - this.alpha) * 100)}%)`;
            span.style.fontWeight = 'bold';

            const shadowAlpha = Math.round(this.alpha * 40);
            span.style.textShadow = `0 0 4px color-mix(in srgb, var(--color-highlight-line), transparent ${100 - shadowAlpha}%)`;
        }

        if (this.deletionAlpha > 0) {
            const delMarker = document.createElement('div');
            delMarker.style.position = 'absolute';
            delMarker.style.bottom = '-2px';
            delMarker.style.left = '0';
            delMarker.style.right = '0';
            delMarker.style.height = '2px';
            delMarker.style.backgroundColor = `color-mix(in srgb, var(--color-danger), transparent ${Math.round((1 - this.deletionAlpha) * 100)}%)`;
            delMarker.style.pointerEvents = 'none';
            delMarker.style.zIndex = '10';
            span.appendChild(delMarker);
        }

        return span;
    }

    eq(other: LineNumberMarker) {
        return (
            this.lineNo === other.lineNo &&
            Math.abs(this.alpha - other.alpha) < 0.01 &&
            Math.abs(this.deletionAlpha - other.deletionAlpha) < 0.01
        );
    }
}

export function createRecentChangesHighlighter(tracker: LineChangeTracker | undefined) {
    if (
        !tracker ||
        (appContext.app.recentChangesCount === 0 && appContext.app.recentChangesTimespan === 0)
    ) {
        return [lineNumbers()];
    }

    return [
        ViewPlugin.fromClass(
            class {
                update(update: ViewUpdate) {
                    if (!update.docChanged || !tracker) return;

                    const isHistoryAction = update.transactions.some(
                        (tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo'),
                    );

                    // 1. Map existing markers to their new positions
                    // This handles shifting lines up/down for all operations (including undo/redo)
                    tracker.mapLines((lineNo) => {
                        try {
                            const oldLine = update.startState.doc.line(lineNo);
                            const newPos = update.changes.mapPos(oldLine.from);
                            return update.state.doc.lineAt(newPos).number;
                        } catch {
                            return null;
                        }
                    });

                    // 2. Identify the lines affected by the current change
                    const affectedLines = new Set<number>();
                    const deletions = new Set<number>();

                    update.changes.iterChanges((fromA, toA, fromB, toB) => {
                        const docA = update.startState.doc;
                        const docB = update.state.doc;

                        const linesA = docA.lineAt(toA).number - docA.lineAt(fromA).number;
                        const linesB = docB.lineAt(toB).number - docB.lineAt(fromB).number;

                        // Check for net deletion
                        if (linesA > linesB) {
                            const lineNo = docB.lineAt(fromB).number;
                            deletions.add(lineNo);
                        }

                        const startLine = docB.lineAt(fromB).number;
                        const endLine = docB.lineAt(Math.min(toB, docB.length)).number;

                        for (let line = startLine; line <= endLine; line++) {
                            affectedLines.add(line);
                        }
                    });

                    // 3. Update the tracker based on action type
                    if (isHistoryAction) {
                        // For undo/redo, we assume the affected lines are reverting to a 'clean' state
                        // relative to the action being undone, so we remove the modification marker.
                        if (affectedLines.size > 0) {
                            tracker.removeLines(Array.from(affectedLines));
                        }
                    } else {
                        // Normal edits
                        const isUserAction = update.transactions.some(
                            (tr) =>
                                tr.isUserEvent('input') ||
                                tr.isUserEvent('delete') ||
                                tr.isUserEvent('move') ||
                                tr.isUserEvent('input.paste'),
                        );

                        if (isUserAction) {
                            if (affectedLines.size > 0) {
                                tracker.recordChanges(Array.from(affectedLines));
                            }
                            if (deletions.size > 0) {
                                deletions.forEach((line) => tracker.recordDeletion(line));
                            }
                        }
                    }
                }
            },
        ),
        gutter({
            class: 'cm-lineNumbers',
            lineMarker(view, line) {
                const lineNo = view.state.doc.lineAt(line.from).number;
                let alpha = 0;
                let deletionAlpha = 0;

                if (tracker) {
                    alpha = tracker.getLineAlpha(
                        lineNo,
                        appContext.app.recentChangesTimespan,
                        appContext.app.recentChangesCount,
                    );

                    deletionAlpha = tracker.getDeletionAlpha(
                        lineNo,
                        appContext.app.recentChangesTimespan,
                        appContext.app.recentChangesCount,
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
            },
        }),
    ];
}
