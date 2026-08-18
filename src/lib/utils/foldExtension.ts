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
  // The app's .cm-gutterElement rule (src/styles/editor.css) pads every
  // gutter cell with 0 8px. That balloons the fold column and shoves the
  // arrows away from the line numbers, so pull the fold cells tight and
  // bring the numbers close under them.
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    // Rendered-mode headings grow their line, and the gutter element tracks
    // that full height. Centering on it would put the arrow mid-way down the
    // oversized line; the marker's own margin-top anchors it to the line
    // number instead (see .cm-fold-marker).
    alignItems: 'flex-start !important',
    justifyContent: 'center',
    padding: '0 1px !important',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    paddingLeft: '4px',
    paddingRight: '8px',
  },
  '.cm-fold-marker': {
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
