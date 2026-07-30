import { EditorView } from '@codemirror/view';

export function generateDynamicTheme(fontSize: number, fontFamily: string, isDark: boolean) {
  const whitespaceColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

  return EditorView.theme({
    '&': { height: '100%', fontSize: `${fontSize}px` },
    '.cm-cursor': {
      borderLeftColor: 'var(--text-primary)',
      borderLeftWidth: '2px',
    },
    '.cm-scroller': { fontFamily, overflow: 'auto', overflowAnchor: 'none' },
    '.cm-content': { fontFamily },
    '.cm-scroller::-webkit-scrollbar': { width: '0', height: '8px' },
    '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
    '.cm-scroller::-webkit-scrollbar-thumb': { background: 'var(--text-secondary)', borderRadius: '4px' },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': { background: 'var(--text-primary)' },
    // position:relative overrides CM6's inline position:sticky on .cm-gutters.
    // Sticky creates a compositor layer that freezes during heavy main-thread frames.
    // Relative keeps the gutter in the normal flow so it repaints every frame.
    '.cm-gutters': { border: 'none', backgroundColor: 'transparent', position: 'relative !important' },
    '.cm-gutterElement': { alignItems: 'flex-start !important' },
    '& .cm-selectionLayer .cm-selectionBackground': {
      background: 'var(--selection-bg) !important',
    },
    '.cm-content ::selection': {
      backgroundColor: 'var(--selection-bg) !important',
    },
    '.cm-selectionMatch': { backgroundColor: 'var(--selection-match-bg)' },
    '.cm-searchMatch': {
      backgroundColor: isDark ? 'rgba(255, 140, 0, 0.85)' : 'rgba(230, 112, 0, 0.85)',
      color: '#000 !important',
      borderRadius: '2px',
    },
    '.cm-searchMatch *': {
      color: '#000 !important',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: isDark ? '#ff8c00 !important' : '#e67000 !important',
      color: isDark ? '#000 !important' : '#000 !important',
      boxShadow: isDark ? '0 0 0 2px #ffcc77 !important' : '0 0 0 2px #cc5500 !important',
      zIndex: '10',
      position: 'relative',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface-2)',
      border: '1px solid var(--border-secondary)',
      color: 'var(--text-primary)',
      borderRadius: '6px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      borderRadius: '6px',
      overflow: 'hidden',
      border: '1px solid var(--border-secondary)',
      backgroundColor: 'var(--surface-2)',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--accent-primary) !important',
      color: 'var(--text-inverse) !important',
    },
    '.cm-tooltip.cm-tooltip-lint': {
      backgroundColor: 'var(--surface-2)',
      border: '1px solid var(--border-secondary)',
      color: 'var(--text-primary)',
    },
    '.cm-highlightSpace': {
      backgroundImage: 'none !important',
      position: 'relative',
      '&:before': {
        content: "'·'",
        color: whitespaceColor,
        pointerEvents: 'none',
        fontWeight: 'bold',
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        textAlign: 'center',
      },
    },
    '.cm-highlightTab': {
      backgroundImage: 'none !important',
      position: 'relative',
      '&:before': {
        content: "'→'",
        color: whitespaceColor,
        pointerEvents: 'none',
        fontWeight: 'bold',
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        textAlign: 'center',
      },
    },
    '.cm-newline': {
      color: whitespaceColor,
      userSelect: 'none',
      pointerEvents: 'none',
      display: 'inline',
    },
  });
}
