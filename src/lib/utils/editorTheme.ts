import { EditorView } from '@codemirror/view';

export function generateDynamicTheme(fontSize: number, fontFamily: string, isDark: boolean, insertMode: 'INS' | 'OVR') {
    const whitespaceColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

    return EditorView.theme({
        '&': { height: '100%', fontSize: `${fontSize}px` },
        '.cm-cursor': {
            borderLeftColor: insertMode === 'OVR' ? 'transparent' : 'var(--color-fg-default)',
            borderBottom: insertMode === 'OVR' ? '2px solid var(--color-accent-secondary)' : 'none',
        },
        '.cm-scroller': { fontFamily, overflow: 'auto', overflowAnchor: 'none' },
        '.cm-content': { fontFamily, paddingBottom: '40px !important' },
        '.cm-scroller::-webkit-scrollbar': { display: 'none' },
        '.cm-gutters': { border: 'none', backgroundColor: 'transparent' },
        '.cm-gutterElement': { alignItems: 'flex-start !important' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'var(--color-selection-bg) !important',
        },
        '.cm-selectionMatch': { backgroundColor: 'var(--color-selection-match-bg)' },
        '.cm-searchMatch': {
            backgroundColor: isDark ? 'rgba(255, 255, 0, 0.2)' : 'rgba(255, 215, 0, 0.4)',
            outline: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '2px',
        },
        '.cm-searchMatch.cm-searchMatch-selected': {
            backgroundColor: isDark ? '#d19a66 !important' : '#ff9900 !important',
            color: isDark ? '#000 !important' : '#fff !important',
            borderRadius: '2px',
        },
        '.cm-tooltip': {
            backgroundColor: 'var(--color-bg-panel)',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-fg-default)',
            borderRadius: '6px',
        },
        '.cm-tooltip.cm-tooltip-autocomplete': {
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--color-border-light)',
            backgroundColor: 'var(--color-bg-panel)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
        },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
            backgroundColor: 'var(--color-accent-primary) !important',
            color: 'var(--color-fg-inverse) !important',
        },
        '.cm-tooltip.cm-tooltip-lint': {
            backgroundColor: 'var(--color-bg-panel)',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-fg-default)',
        },
        '.cm-highlightSpace': {
            backgroundImage: 'none !important',
            position: 'relative',
            '&:before': {
                content: "'·'",
                color: whitespaceColor,
                position: 'absolute',
                top: '0',
                left: '0',
                pointerEvents: 'none',
                fontWeight: 'bold',
                transform: 'scale(1.2)',
            },
        },
        '.cm-highlightTab': {
            backgroundImage: 'none !important',
            position: 'relative',
            '&:before': {
                content: "'→'",
                color: whitespaceColor,
                position: 'absolute',
                top: '0',
                left: '0',
                pointerEvents: 'none',
                fontWeight: 'bold',
                transform: 'scale(1.2)',
            },
        },
        '.cm-newline': {
            color: whitespaceColor,
            userSelect: 'none',
            pointerEvents: 'none',
            display: 'inline-block',
            verticalAlign: 'middle',
            marginLeft: '2px',
            fontWeight: 'bold',
            transform: 'scale(1.2)',
        },
    });
}
