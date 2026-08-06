import { ensureSyntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { CONFIG } from '$lib/utils/config';

export type RestoreStrategy = 'pixel' | 'anchor' | 'auto';

/**
 * Restore a saved scroll position by anchoring to a saved top line (robust
 * across content/wrap changes), falling back to a saved pixel offset. No-op
 * when there is no saved position to restore.
 *
 * Applies synchronously so it can run inside an existing `requestMeasure`
 * write (or `requestAnimationFrame`) without scheduling an extra measure
 * cycle; deferring it would let the new document paint one frame at scroll
 * top, with the deep viewport still unparsed and unstyled.
 */
export function restoreScrollByTopLine(view: EditorView, topLine: number, scrollTop: number): void {
  if (!view.scrollDOM || (topLine <= 1 && scrollTop <= 0)) return;

  if (topLine > 1) {
    try {
      const safeLine = Math.max(1, Math.min(topLine, view.state.doc.lines));
      const lineInfo = view.state.doc.line(safeLine);
      // Parse the doc up to the target line (plus an estimate of the visible
      // viewport) before scrolling so the deep viewport is already
      // syntax-highlighted when it first paints, instead of flashing un-styled
      // text for a frame while the parser catches up. ensureSyntaxTree also
      // continues parsing in the background if the budget later expires, so the
      // highlight still lands shortly after on very large docs.
      const lineHeight = 21;
      const visibleLines = Math.ceil((view.scrollDOM.clientHeight || 600) / lineHeight);
      const extendTo = Math.min(view.state.doc.lines, safeLine + visibleLines);
      const parseUpto = view.state.doc.line(extendTo).to;
      ensureSyntaxTree(view.state, parseUpto, CONFIG.PERFORMANCE.SCROLL_RESTORE_PARSE_TIMEOUT_MS);
      view.dispatch({ effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }) });
      return;
    } catch {
      // Fall through to pixel offset.
    }
  }
  view.scrollDOM.scrollTop = scrollTop;
}

export class ScrollManager {
  private snapshot: {
    scrollTop: number;
    anchorLine: number;
    anchorOffset: number;
    totalLines: number;
  } | null = null;

  public capture(view: EditorView, _context: string) {
    if (!view.scrollDOM) return;

    const dom = view.scrollDOM;
    const scrollTop = dom.scrollTop;

    const block = view.lineBlockAtHeight(scrollTop);
    const line = view.state.doc.lineAt(block.from);

    this.snapshot = {
      scrollTop: scrollTop,
      anchorLine: line.number,
      anchorOffset: scrollTop - block.top,
      totalLines: view.state.doc.lines,
    };
  }

  public restore(view: EditorView, strategy: RestoreStrategy = 'auto') {
    if (!this.snapshot || !view.scrollDOM) {
      return;
    }

    const target = this.snapshot;

    requestAnimationFrame(() => {
      if (!view.scrollDOM) return;

      view.requestMeasure({
        read: () => {
          const currentDoc = view.state.doc;
          const currentLines = currentDoc.lines;
          const scrollHeight = view.scrollDOM.scrollHeight;
          const clientHeight = view.scrollDOM.clientHeight;

          let effectiveStrategy = strategy;
          let reason = 'Manual override';

          if (strategy === 'auto') {
            if (currentLines !== target.totalLines) {
              effectiveStrategy = 'anchor';
              reason = `Line count changed (${target.totalLines} -> ${currentLines})`;
            } else {
              effectiveStrategy = 'pixel';
              reason = 'Line count stable';
            }
          }

          let targetTop = target.scrollTop;
          let logDetail: string;

          if (effectiveStrategy === 'anchor') {
            try {
              const safeLine = Math.max(1, Math.min(target.anchorLine, currentLines));
              const lineInfo = currentDoc.line(safeLine);
              const block = view.lineBlockAt(lineInfo.from);
              targetTop = block.top + target.anchorOffset;
              logDetail = `Line ${safeLine} @ ${block.top} + ${target.anchorOffset} = ${targetTop}`;
            } catch {
              targetTop = target.scrollTop; // Fallback
              logDetail = 'Error (Fallback to pixel)';
            }
          } else {
            logDetail = `Pixel: ${target.scrollTop}`;
          }

          // Clamp
          const maxScroll = Math.max(0, scrollHeight - clientHeight);
          const clampedTop = Math.max(0, Math.min(targetTop, maxScroll));

          if (clampedTop !== targetTop) {
            logDetail += ` (Clamped to ${clampedTop} from ${targetTop})`;
          }

          return {
            targetTop: clampedTop,
            strategy: effectiveStrategy,
            reason,
            logDetail,
            domReady: scrollHeight > clientHeight,
          };
        },
        write: ({ targetTop, domReady }) => {
          view.scrollDOM.scrollTop = targetTop;

          if (targetTop > 0 && view.scrollDOM.scrollTop === 0 && domReady) {
            requestAnimationFrame(() => {
              if (view.scrollDOM?.scrollHeight > view.scrollDOM.clientHeight) {
                view.scrollDOM.scrollTop = targetTop;
              }
            });
          }
        },
      });
    });
  }

  public getSnapshot() {
    return this.snapshot;
  }
}
