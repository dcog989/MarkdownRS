import { foldGutter, foldKeymap } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

// Shared so the gutter's click-target check can't silently break if the
// marker class is ever renamed.
const FOLD_MARKER_CLASS = 'cm-fold-marker';
const FOLD_MARKER_CLOSED_CLASS = 'cm-fold-marker-closed';

// Chevron built from CSS borders so the arrow matches the theme's
// --editor-fg-tertiary/--editor-fg colors and scales with the font size.
const foldMarkerDOM = (open: boolean) => {
  const span = document.createElement('span');
  span.className = open ? FOLD_MARKER_CLASS : `${FOLD_MARKER_CLASS} ${FOLD_MARKER_CLOSED_CLASS}`;
  span.setAttribute('aria-hidden', 'true');
  return span;
};

const foldTheme = EditorView.theme({
  // The fold arrows are shown immediately to the left of the line numbers
  // instead of in their own column: collapse the fold gutter to zero width
  // and let each marker overflow right into the line-number gutter's left
  // padding. This removes the extra column entirely.
  '.cm-foldGutter': { overflow: 'visible' },
  '.cm-foldGutter .cm-gutterElement': {
    position: 'relative',
    width: '0',
    overflow: 'visible',
    padding: '0',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    paddingLeft: '10px',
    paddingRight: '8px',
  },
  '.cm-foldGutter .cm-fold-marker': {
    // Zero-width gutter, so the folded column gives no layout space; the
    // absolute marker positions itself in the line numbers' left padding.
    position: 'absolute',
    left: '4px',
    top: '0',
    display: 'inline-block',
    width: '0',
    height: '0',
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderTop: '6px solid currentColor',
    color: 'var(--editor-fg-tertiary)',
    opacity: '0.9',
    // The marker is 6px tall (border-top), so half of it is 3px. A default
    // line is 1.4em; offsetting by 0.7em - 3px centers the arrow on the line
    // number's vertical position regardless of how tall the rendered line is.
    marginTop: 'calc(0.7em - 3px)',
  },
  '.cm-fold-marker-closed': { transform: 'rotate(-90deg)' },
  '.cm-foldGutter .cm-gutterElement:hover .cm-fold-marker': {
    color: 'var(--editor-fg)',
    opacity: '1',
  },
  // The default fold widget paints a white pill with an "unfold" tooltip at
  // the end of folded lines; hide it entirely. Fold state is shown by the
  // closed arrow in the gutter instead.
  '.cm-foldPlaceholder': { display: 'none !important' },
});

export function createFoldExtensions(): Extension[] {
  return [
    foldGutter({
      markerDOM: foldMarkerDOM,
      // Clicking the arrow folds/unfolds via the built-in `click` handler
      // (it runs first and dominates ours). Clicking the empty fold strip
      // selects the line instead, keeping the gutter click-to-select
      // behavior consistent with the line-number gutter.
      domEventHandlers: {
        mousedown(view, line, event) {
          const me = event as MouseEvent;
          if (me.button !== 0) return false;
          if ((me.target as HTMLElement).closest(`.${FOLD_MARKER_CLASS}`)) return false;
          me.preventDefault();
          view.dispatch({
            selection: { anchor: line.from, head: line.to },
          });
          return true;
        },
      },
    }),
    // foldKeymap is a KeyBinding[] and must be wrapped before use.
    keymap.of(foldKeymap),
    foldTheme,
  ];
}
