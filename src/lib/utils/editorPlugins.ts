import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { appContext } from '$lib/stores/state.svelte';

export class NewlineWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-newline';
    span.textContent = '¬';
    return span;
  }
}

function getNewlineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      if (line.to < view.state.doc.length) {
        builder.add(line.to, line.to, Decoration.widget({ widget: new NewlineWidget(), side: -1 }));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const newlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = getNewlineDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getNewlineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const spaceDeco = Decoration.mark({ class: 'cm-highlightSpace' });
const tabDeco = Decoration.mark({ class: 'cm-highlightTab' });

function getSelectionWhitespaceDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const ranges = view.state.selection.ranges;
  const visibleRanges = view.visibleRanges;

  let rangeIndex = 0;

  for (const { from: vFrom, to: vTo } of visibleRanges) {
    for (let i = rangeIndex; i < ranges.length; i++) {
      const range = ranges[i];
      if (range.to <= vFrom) {
        rangeIndex = i + 1;
        continue;
      }
      if (range.from >= vTo) break;

      const start = Math.max(vFrom, range.from);
      const end = Math.min(vTo, range.to);

      if (start < end) {
        const text = doc.sliceString(start, end);
        for (let k = 0; k < text.length; k++) {
          const char = text[k];
          const pos = start + k;
          if (char === ' ') builder.add(pos, pos + 1, spaceDeco);
          else if (char === '\t') builder.add(pos, pos + 1, tabDeco);
        }
      }
    }
  }
  return builder.finish();
}

export const selectionWhitespacePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = getSelectionWhitespaceDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = getSelectionWhitespaceDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const rulerMeasure = ViewPlugin.fromClass(
  class {
    gutters: HTMLElement | null;
    constructor(view: EditorView) {
      const gutters = view.dom.querySelector('.cm-gutters');
      this.gutters = gutters instanceof HTMLElement ? gutters : null;
      this.measure(view);
    }
    update(update: ViewUpdate) {
      if (update.geometryChanged) {
        this.measure(update.view);
      }
    }
    measure(view: EditorView) {
      const column = appContext.settings.wrapGuideColumn;
      const dom = view.scrollDOM;
      if (column > 0) {
        const charWidth = view.defaultCharacterWidth;
        const gutterWidth = this.gutters?.offsetWidth || 0;
        const style = window.getComputedStyle(view.contentDOM);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const left = gutterWidth + paddingLeft + column * charWidth;
        dom.style.setProperty('--ruler-left', `${left}px`);
        dom.style.setProperty('--ruler-display', '');
      } else {
        dom.style.setProperty('--ruler-display', 'none');
      }
    }
  },
);

const rulerTheme = EditorView.theme({
  '.cm-scroller::after': {
    content: '""',
    position: 'absolute',
    top: '0',
    bottom: '0',
    width: '1px',
    backgroundColor: 'var(--border-secondary)',
    opacity: '0.3',
    pointerEvents: 'none',
    zIndex: '0',
    left: 'var(--ruler-left, 0px)',
    display: 'var(--ruler-display, none)',
  },
});

export const rulerPlugin = [rulerMeasure, rulerTheme];
