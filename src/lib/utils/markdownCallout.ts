import { syntaxTree } from "@codemirror/language";
import type { Line, Range } from "@codemirror/state";
import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import { type CalloutInfo, type DecorationWalk, isRevealed } from "./markdownDecorationCore";

const CALLOUT_STYLES: Record<string, { title: string; icon: string }> = {
  note: {
    title: "Note",
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  },
  tip: {
    title: "Tip",
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
  },
  important: {
    title: "Important",
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  },
  warning: {
    title: "Warning",
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.7 18.5 13.5 4.4a1.9 1.9 0 0 0-3 0L2.3 18.5A1.9 1.9 0 0 0 4 21h16a1.9 1.9 0 0 0 1.7-2.5z"/><path d="M12 9v4M12 17h.01"/></svg>',
  },
  caution: {
    title: "Caution",
    icon: '<svg class="callout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 2h8.2L22 7.9v8.2l-5.9 5.9H7.9L2 16.1V7.9z"/><path d="M12 8v4M12 16h.01"/></svg>',
  },
};

const calloutMatchRe = /^(\s*>\s*)(\[!(note|tip|important|warning|caution)\])(.*)$/i;

export function matchCalloutLine(text: string): { start: number; raw: string; kind: string } | null {
  const m = calloutMatchRe.exec(text);
  if (!m) return null;
  return { start: m[1].length, raw: m[2], kind: m[3].toLowerCase() };
}

class CalloutTitleWidget extends WidgetType {
  constructor(
    private readonly kind: string,
    private readonly title: string,
  ) {
    super();
  }

  eq(other: CalloutTitleWidget): boolean {
    return other.kind === this.kind && other.title === this.title;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `cm-callout-title cm-callout-${this.kind}`;
    span.innerHTML = `${CALLOUT_STYLES[this.kind].icon}<span class="cm-callout-title-text">${this.title}</span>`;
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Finds callout blockquotes in the visible ranges. Returns the marker text
 * spans (for coloring/replacement) and the map of callout line numbers to
 * their type. Callouts are always decorated (even under the cursor) so they
 * keep their styled appearance while being edited.
 */
export function collectCallouts(view: EditorView): CalloutInfo {
  const markers: { from: number; to: number; kind: string; active: boolean }[] = [];
  const lines = new Map<number, string>();
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "Blockquote") return;
        const fromLine = view.state.doc.lineAt(node.from);
        const callout = matchCalloutLine(fromLine.text);
        if (!callout) return;
        const markerStart = fromLine.from + callout.start;
        const active = isRevealed(view, node.from, node.to);
        markers.push({
          from: markerStart,
          to: markerStart + callout.raw.length,
          kind: callout.kind,
          active,
        });
        const toLine = view.state.doc.lineAt(node.to);
        for (let i = fromLine.number; i <= toLine.number; i++) {
          lines.set(i, callout.kind);
        }
      },
    });
  }

  return { markers, lines };
}

export function collectCalloutLine(walk: DecorationWalk, line: Line): void {
  const calloutKind = walk.calloutLines.get(line.number);
  if (calloutKind) {
    walk.ranges.push(Decoration.line({ class: `cm-callout cm-callout-${calloutKind}` }).range(line.from));
  }
}

export function collectCalloutDecorations(walk: DecorationWalk): void {
  for (const m of walk.calloutMarkers) {
    if (m.active) {
      walk.ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
    } else {
      walk.ranges.push(
        Decoration.replace({ widget: new CalloutTitleWidget(m.kind, CALLOUT_STYLES[m.kind].title) }).range(
          m.from,
          m.to,
        ),
      );
    }
  }
}

export function collectRawCalloutDecorations(
  view: EditorView,
  callouts: CalloutInfo,
  ranges: Range<Decoration>[],
): void {
  for (const m of callouts.markers) {
    ranges.push(Decoration.mark({ class: `cm-callout-marker cm-callout-${m.kind}` }).range(m.from, m.to));
  }
  for (const [lineNo, kind] of callouts.lines) {
    ranges.push(Decoration.line({ class: `cm-callout cm-callout-${kind}` }).range(view.state.doc.line(lineNo).from));
  }
}
