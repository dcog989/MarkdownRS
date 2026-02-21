// The state object
export const appState = $state({
    activeTabId: null as string | null,
    splitView: true,
    theme: 'dark' as 'dark' | 'light',
    activeTheme: 'default-dark',
    availableThemes: ['default-dark', 'default-light'] as string[],
    splitPercentage: 0.5,
    splitOrientation: 'vertical' as 'vertical' | 'horizontal',
    tabCycling: 'mru' as 'mru' | 'sequential',
    tabWidthMin: 80,
    tabWidthMax: 180,
    statusBarTransparency: 0,
    newTabPosition: 'end' as 'beginning' | 'right' | 'end',
    startupBehavior: 'last-focused' as 'first' | 'last-focused' | 'new',
    editorFontFamily: "'Source Code Pro', 'Cascadia Code', monospace, ui-monospace",
    editorFontSize: 14,
    editorWordWrap: true,
    showWhitespace: false,
    enableAutocomplete: true,
    autocompleteDelay: 850,
    recentChangesTimespan: 0,
    recentChangesCount: 16,
    undoDepth: 100,
    previewFontFamily: 'system-ui, -apple-system, sans-serif',
    previewFontSize: 16,
    gfmEnabled: true,
    markdownFlavor: 'gfm' as 'commonmark' | 'gfm',
    logLevel: 'info' as 'trace' | 'debug' | 'info' | 'warn' | 'error',
    formatOnSave: false,
    formatOnPaste: false,
    defaultIndent: 2,
    formatterBulletChar: '-' as '-' | '*' | '+',
    formatterEmphasisChar: '*' as '*' | '_',
    formatterCodeFence: '```' as '```' | '~~~',
    formatterTableAlignment: true,
    lineEndingPreference: 'system' as 'system' | 'LF' | 'CRLF',
    tooltipDelay: 1000,
    findPanelTransparent: false,
    findPanelCloseOnBlur: false,
    languageDictionaries: ['en-US'] as string[],
    technicalDictionaries: true,
    scienceDictionaries: false,
    tabNameFromContent: false,
    wrapGuideColumn: 0,
    doubleClickSelectsTrailingSpace: false,
    collapsePinnedTabs: false,
    customShortcuts: {} as Record<string, string>,
    confirmationSuppressed: false,
    // Tab switching flag to prevent auto-format during transitions
    isTabSwitching: false,
    maxFileSizeMB: 50,
    writerMode: false,
});

// Logic functions
export function toggleSplitView() {
    appState.splitView = !appState.splitView;
}

export function setTheme(newTheme: 'dark' | 'light') {
    appState.theme = newTheme;
    appState.activeTheme = newTheme === 'dark' ? 'default-dark' : 'default-light';
}

export function toggleOrientation() {
    appState.splitOrientation =
        appState.splitOrientation === 'vertical' ? 'horizontal' : 'vertical';
}

export function toggleWriterMode() {
    appState.writerMode = !appState.writerMode;
}
