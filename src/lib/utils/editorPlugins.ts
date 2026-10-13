import { getSearchQuery, searchPanelOpen } from "@codemirror/search";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { appContext } from "$lib/stores/state.svelte";

export class NewlineWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-newline";
    span.textContent = "¬";
    return span;
  }
}

function getNewlineDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const newlineDeco = Decoration.widget({ widget: new NewlineWidget(), side: -1 });

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      if (line.to < view.state.doc.length) {
        ranges.push(newlineDeco.range(line.to));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
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

const spaceDeco = Decoration.mark({ class: "cm-highlightSpace" });
const tabDeco = Decoration.mark({ class: "cm-highlightTab" });

function getSelectionWhitespaceDecorations(view: EditorView): DecorationSet {
  const rangesDeco: Range<Decoration>[] = [];
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
          if (char === " ") rangesDeco.push(spaceDeco.range(pos, pos + 1));
          else if (char === "\t") rangesDeco.push(tabDeco.range(pos, pos + 1));
        }
      }
    }
  }
  return Decoration.set(rangesDeco, true);
}

/**
 * Mirrors selection state onto the editor element as classes, so the stylesheet
 * can react to it without `:has()`. A `:has(.cm-selectionBackground)` rule on
 * `.cm-editor` made WebKitGTK re-walk the whole editor subtree on every drag
 * frame — the content DOM precedes the selection layer, so the match is found
 * only after traversing it — which left the selection paint trailing the
 * pointer.
 */
export const selectionStatePlugin = ViewPlugin.fromClass(
  class {
    hasSelection: boolean;
    hasSelectedMatch: boolean;
    constructor(view: EditorView) {
      this.hasSelection = hasNonEmptySelection(view);
      this.hasSelectedMatch = hasSelectedSearchMatch(view.state);
      this.sync(view);
    }
    update(update: ViewUpdate) {
      const hasSelection = hasNonEmptySelection(update.view);
      const hasSelectedMatch = hasSelectedSearchMatch(update.state);
      if (hasSelection === this.hasSelection && hasSelectedMatch === this.hasSelectedMatch) return;
      this.hasSelection = hasSelection;
      this.hasSelectedMatch = hasSelectedMatch;
      this.sync(update.view);
    }
    sync(view: EditorView) {
      view.dom.classList.toggle("cm-has-selection", this.hasSelection);
      view.dom.classList.toggle("cm-has-selected-match", this.hasSelectedMatch);
    }
  },
);

function hasNonEmptySelection(view: EditorView): boolean {
  return view.state.selection.ranges.some((range) => !range.empty);
}

/** Same condition the search extension uses for `.cm-searchMatch-selected`:
 *  the panel is open and the main selection is exactly a match. */
function hasSelectedSearchMatch(state: EditorState): boolean {
  const main = state.selection.main;
  if (main.empty || !searchPanelOpen(state)) return false;
  const query = getSearchQuery(state);
  if (!query.valid) return false;
  const match = query.getCursor(state, main.from, main.to).next();
  return !match.done && match.value.from === main.from && match.value.to === main.to;
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
      const gutters = view.dom.querySelector(".cm-gutters");
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
        dom.style.setProperty("--ruler-left", `${left}px`);
        dom.dataset.rulerActive = "";
      } else {
        delete dom.dataset.rulerActive;
      }
    }
  },
);

const rulerTheme = EditorView.theme({
  ".cm-scroller::after": {
    content: '""',
    position: "absolute",
    top: "0",
    bottom: "0",
    width: "1px",
    backgroundColor: "var(--border-secondary)",
    opacity: "0.3",
    pointerEvents: "none",
    zIndex: "0",
    left: "var(--ruler-left, 0px)",
    display: "none",
  },
  ".cm-scroller[data-ruler-active]::after": {
    display: "block",
  },
});

export const rulerPlugin = [rulerMeasure, rulerTheme];
