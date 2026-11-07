import type { Extension } from "@codemirror/state";
import { type BlockInfo, type EditorView, GutterMarker, gutter, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { ContextMenuCallback } from "$lib/components/editor/codemirror/events";
import { appContext } from "$lib/stores/state.svelte";
import { CONFIG } from "$lib/utils/config";
import type { LineChangeTracker } from "$lib/utils/lineChangeTracker.svelte";

/// Line count used for the gutter's width spacer. The spacer renders this many
/// digits, so the editor (and tab bar gutter column) does not shift between
/// tabs. One extra digit beyond 4 widens the gutter by a single character so
/// line numbers have a little breathing room.
const MIN_GUTTER_WIDTH_LINES = 99999;

// Lucide corner-down-right, inlined because gutter markers build DOM directly.
const WRAP_INDICATOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>';

/** How many continuation rows a soft-wrapped line has, and their height. */
interface WrapRows {
  count: number;
  height: number;
}

/** The `.cm-line` element containing `pos`, including the document start. */
function lineElementAt(view: EditorView, pos: number): HTMLElement | null {
  const { node, offset } = view.domAtPos(pos);
  const start = node instanceof Element ? node : node.parentElement;
  const line = start?.closest(".cm-line");
  if (line) return line as HTMLElement;

  // domAtPos returns the content element itself for a position before the
  // first line's first child.
  const child = node.childNodes[offset] ?? node.childNodes[offset - 1];
  return child instanceof Element ? child.closest<HTMLElement>(".cm-line") : null;
}

// Widgets that lay out their own rows; a line containing one has no soft-wrap
// rows to mark.
const MULTILINE_WIDGET_SELECTOR = ".cm-table-widget, .cm-image-widget";

/** Measures a soft-wrapped line's continuation rows, or null if it doesn't wrap. */
function measureWrapRows(view: EditorView, line: BlockInfo): WrapRows | null {
  // Cheap gate: only blocks taller than one default row can wrap.
  if (line.height <= view.defaultLineHeight * 1.5) return null;

  try {
    const lineEl = lineElementAt(view, line.from);
    if (!lineEl || lineEl.querySelector(MULTILINE_WIDGET_SELECTOR)) return null;

    const range = document.createRange();
    range.selectNodeContents(lineEl);
    const lineTop = lineEl.getBoundingClientRect().top;
    const tolerance = view.defaultLineHeight / 2;

    // Inline boxes on the same row can differ by a pixel; merge tops closer
    // together than half a row.
    const tops: number[] = [];
    for (const rect of range.getClientRects()) {
      if (rect.height <= 0) continue;
      const top = rect.top - lineTop;
      if (tops.length === 0 || top - tops[tops.length - 1] > tolerance) tops.push(top);
    }

    // Wrapped rows share one row height, so the first gap describes them all.
    return tops.length > 1 ? { count: tops.length - 1, height: tops[1] - tops[0] } : null;
  } catch {
    // Gutter markers are built before CodeMirror maps the new state onto the
    // document DOM (view construction and setState), so domAtPos can throw.
    // The measure pass that follows re-renders the gutter against the current
    // DOM; a throw here must never deactivate the gutter plugin.
    return null;
  }
}

class LineNumberMarker extends GutterMarker {
  constructor(
    private lineNo: number,
    private alpha: number,
    private deletionAlpha: number,
    private wrap: WrapRows | null = null,
  ) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-lineNumber-marker";
    span.textContent = String(this.lineNo);

    if (this.alpha > 0) {
      span.classList.add("cm-lineNumber-changed");
      span.style.setProperty("--line-alpha", String(this.alpha));
      const shadowAlpha = Math.round(this.alpha * 40);
      span.style.setProperty("--line-shadow-alpha", String(shadowAlpha));
    }

    if (this.deletionAlpha > 0) {
      const delMarker = document.createElement("div");
      delMarker.className = "cm-deletion-marker";
      delMarker.style.setProperty("--deletion-alpha", String(this.deletionAlpha));
      span.appendChild(delMarker);
    }

    const wrap = this.wrap;
    if (wrap) {
      for (let row = 1; row <= wrap.count; row++) {
        const indicator = document.createElement("span");
        indicator.className = "cm-wrap-indicator";
        indicator.style.top = `${row * wrap.height}px`;
        indicator.style.height = `${wrap.height}px`;
        indicator.innerHTML = WRAP_INDICATOR_SVG;
        span.appendChild(indicator);
      }
    }

    return span;
  }

  eq(other: LineNumberMarker) {
    return (
      this.lineNo === other.lineNo &&
      Math.abs(this.alpha - other.alpha) < 0.01 &&
      Math.abs(this.deletionAlpha - other.deletionAlpha) < 0.01 &&
      this.wrap?.count === other.wrap?.count &&
      Math.abs((this.wrap?.height ?? 0) - (other.wrap?.height ?? 0)) < 0.5
    );
  }
}

export function createRecentChangesHighlighter(
  tracker: LineChangeTracker | undefined,
  onContextMenu?: ContextMenuCallback,
) {
  const hasTracking = !!(tracker && appContext.settings.recentChangesCount > 0);

  const result: Extension[] = [];

  if (hasTracking) {
    result.push(
      ViewPlugin.fromClass(
        class {
          private fadeTimer: number | null = null;

          constructor(view: EditorView) {
            this.scheduleFade(view);
          }

          destroy() {
            if (this.fadeTimer !== null) {
              clearTimeout(this.fadeTimer);
              this.fadeTimer = null;
            }
          }

          // Gutter markers only recompute when a view update is dispatched, so
          // once tracked lines age out of the time span nothing would re-render
          // them. Dispatch an empty transaction periodically while highlights
          // are still time-active so the alpha fades out on its own.
          private scheduleFade(view: EditorView) {
            if (this.fadeTimer !== null || !tracker) return;
            const timespan = appContext.settings.recentChangesTimespan;
            // 0 means unlimited: nothing ages out, so no re-render timer is needed.
            if (timespan <= 0 || !tracker.hasActiveHighlights(timespan)) return;

            const tick = () => {
              this.fadeTimer = null;
              view.dispatch({});
              if (tracker.hasActiveHighlights(timespan)) this.scheduleFade(view);
            };
            this.fadeTimer = window.setTimeout(tick, CONFIG.EDITOR.RECENT_CHANGES_FADE_REFRESH_MS);
          }

          update(update: ViewUpdate) {
            if (!update.docChanged || !tracker) return;

            const isHistoryAction = update.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"));

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

              // Only treat the edit as a deletion when actual (non-blank)
              // content was removed. Deleting a blank line or joining two
              // lines removes only whitespace/newlines and should not mark a
              // line as deleted.
              if (linesA > linesB && /\S/.test(docA.sliceString(fromA, toA))) {
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
                  !tr.isUserEvent("input.type.sync") &&
                  (tr.isUserEvent("input") ||
                    tr.isUserEvent("delete") ||
                    tr.isUserEvent("move") ||
                    tr.isUserEvent("input.paste")),
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

            this.scheduleFade(update.view);
          }
        },
      ),
    );
  }

  result.push(
    gutter({
      class: "cm-lineNumbers",
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

        return new LineNumberMarker(lineNo, alpha, deletionAlpha, measureWrapRows(view, line));
      },
      initialSpacer: (view) => new LineNumberMarker(Math.max(view.state.doc.lines, MIN_GUTTER_WIDTH_LINES), 0, 0),
      updateSpacer: (spacer, update) => {
        if (update.docChanged) {
          return new LineNumberMarker(Math.max(update.state.doc.lines, MIN_GUTTER_WIDTH_LINES), 0, 0);
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
