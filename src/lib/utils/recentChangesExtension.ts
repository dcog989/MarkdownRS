import type { Extension } from '@codemirror/state';
import { GutterMarker, gutter, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { ContextMenuCallback } from '$lib/components/editor/codemirror/events';
import { appContext } from '$lib/stores/state.svelte';
import type { LineChangeTracker } from '$lib/utils/lineChangeTracker.svelte';

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
    span.className = 'cm-lineNumber-marker';
    span.textContent = String(this.lineNo);

    if (this.alpha > 0) {
      span.classList.add('cm-lineNumber-changed');
      span.style.setProperty('--line-alpha', String(this.alpha));
      const shadowAlpha = Math.round(this.alpha * 40);
      span.style.setProperty('--line-shadow-alpha', String(shadowAlpha));
    }

    if (this.deletionAlpha > 0) {
      const delMarker = document.createElement('div');
      delMarker.className = 'cm-deletion-marker';
      delMarker.style.setProperty('--deletion-alpha', String(this.deletionAlpha));
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

export function createRecentChangesHighlighter(
  tracker: LineChangeTracker | undefined,
  onContextMenu?: ContextMenuCallback,
) {
  const hasTracking = !!(
    tracker &&
    appContext.settings.recentChangesCount > 0 &&
    appContext.settings.recentChangesTimespan > 0
  );

  const result: Extension[] = [];

  if (hasTracking) {
    result.push(
      ViewPlugin.fromClass(
        class {
          update(update: ViewUpdate) {
            if (!update.docChanged || !tracker) return;

            const isHistoryAction = update.transactions.some((tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo'));

            tracker.mapLines((lineNo) => {
              try {
                const oldLine = update.startState.doc.line(lineNo);
                const newPos = update.changes.mapPos(oldLine.from);
                return update.state.doc.lineAt(newPos).number;
              } catch {
                return null;
              }
            });

            const affectedLines = new Set<number>();
            const deletions = new Set<number>();

            update.changes.iterChanges((fromA, toA, fromB, toB) => {
              const docA = update.startState.doc;
              const docB = update.state.doc;

              const linesA = docA.lineAt(toA).number - docA.lineAt(fromA).number;
              const linesB = docB.lineAt(toB).number - docB.lineAt(fromB).number;

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

            if (isHistoryAction) {
              if (affectedLines.size > 0) {
                tracker.removeLines(Array.from(affectedLines));
              }
            } else {
              // tabSync applies store content to the view with userEvent
              // 'input.type.sync'; prefix matching makes it look like 'input',
              // so exclude it explicitly to avoid marking reloads/format-on-save
              // as user edits.
              const isUserAction = update.transactions.some(
                (tr) =>
                  !tr.isUserEvent('input.type.sync') &&
                  (tr.isUserEvent('input') ||
                    tr.isUserEvent('delete') ||
                    tr.isUserEvent('move') ||
                    tr.isUserEvent('input.paste')),
              );

              if (isUserAction) {
                if (affectedLines.size > 0) {
                  tracker.recordChanges(Array.from(affectedLines));
                }
                if (deletions.size > 0) {
                  for (const line of deletions) {
                    tracker.recordDeletion(line);
                  }
                }
              }
            }
          }
        },
      ),
    );
  }

  result.push(
    gutter({
      class: 'cm-lineNumbers',
      lineMarker(view, line) {
        const lineNo = view.state.doc.lineAt(line.from).number;
        let alpha = 0;
        let deletionAlpha = 0;

        if (tracker) {
          alpha = tracker.getLineAlpha(
            lineNo,
            appContext.settings.recentChangesTimespan,
            appContext.settings.recentChangesCount,
          );
          deletionAlpha = tracker.getDeletionAlpha(
            lineNo,
            appContext.settings.recentChangesTimespan,
            appContext.settings.recentChangesCount,
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
      domEventHandlers: {
        mousedown(view, line, event) {
          const me = event as MouseEvent;
          if (me.button === 0) {
            me.preventDefault();
            view.dispatch({
              selection: { anchor: line.from, head: line.to },
              scrollIntoView: true,
            });
            return true;
          }
          return false;
        },
        contextmenu(view, line, event) {
          const me = event as MouseEvent;
          me.preventDefault();
          view.dispatch({
            selection: { anchor: line.from, head: line.to },
            scrollIntoView: true,
          });
          if (onContextMenu) {
            onContextMenu(me, view);
          }
          return true;
        },
      },
    }),
  );

  return result;
}
